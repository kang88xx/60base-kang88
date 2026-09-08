// Browser integration coverage against real IndexedDB transactions and playable video fixtures.
export function registerServiceTests({ test, assert, baseUrl, generateValidVideoBuffer }) {
  async function fixture(browser, run) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      const video = await generateValidVideoBuffer(page);
      await page.evaluate(async bytes => {
        const service = await import('/shared/service-store.js');
        const store = await import('/shared/store.js');
        const data = await import('/shared/data.js');
        const blob = new Blob([new Uint8Array(bytes)], { type: 'video/webm' });
        const require = (condition, message) => { if (!condition) throw new Error(message); };
        const rejects = async (fn, message) => {
          let rejected = false;
          try { await fn(); } catch { rejected = true; }
          require(rejected, message);
        };
        const clip = async () => store.saveClip({ title: '실제 테스트 영상', missionId: data.missions[0].id, status: 'ready', source: 'upload', blob, size: blob.size, mimeType: blob.type, duration: 1 });
        const earn = async () => {
          const record = await clip();
          const submission = await service.submitClip(record.id);
          return service.reviewSubmission(submission.id, { decision: 'approved' });
        };
        const account = () => service.savePayoutAccount({ bankCode: data.banks[0].code, holder: '테스터', last4: '1234' });
        window.domain = { service, store, data, require, rejects, clip, earn, account };
      }, [...video]);
      await run(page);
    } finally { await context.close(); }
  }

  test('service review refuses examples and duplicate submissions while preserving rejection history', async ({ browser }) => fixture(browser, page => page.evaluate(async () => {
    const {service, store, require, rejects, clip} = window.domain;
    await store.addExamples();
    await rejects(() => service.submitClip('sample-table'), 'example must not earn real review eligibility');
    const record = await clip();
    const first = await service.submitClip(record.id);
    await rejects(() => service.submitClip(record.id), 'active submission must not duplicate');
    await service.startReview(first.id);
    await rejects(() => service.reviewSubmission(first.id, {decision:'rejected', reason:'  '}), 'rejection requires reason');
    await service.reviewSubmission(first.id, {decision:'rejected', reason:'손이 화면 밖으로 나갑니다'});
    const retry = await service.submitClip(record.id);
    const state = await service.getServiceState();
    require(retry.attempt === 2 && retry.id !== first.id, 'resubmission must be a second attempt');
    require(state.submissions.find(s => s.id === first.id)?.reason === '손이 화면 밖으로 나갑니다', 'previous rejection must remain');
    require(state.wallet.available === 0, 'rejected/pending submissions must not credit wallet');
  })));

  test('service concurrent approval credits once and rejects conflicting final decisions', async ({ browser }) => fixture(browser, page => page.evaluate(async () => {
    const {service, require, rejects, clip} = window.domain;
    const submission = await service.submitClip((await clip()).id);
    await Promise.all([service.reviewSubmission(submission.id, {decision:'approved'}), service.reviewSubmission(submission.id, {decision:'approved'})]);
    const state = await service.getServiceState();
    require(state.wallet.available === submission.reward && state.wallet.totalEarned === submission.reward, 'approval must credit exactly one reward');
    require(state.ledger.length === 1, 'duplicate approval must not append duplicate credit');
    await rejects(() => service.reviewSubmission(submission.id, {decision:'rejected',reason:'다른 결정'}), 'conflicting final decision must fail');
    await rejects(() => service.submitClip(submission.clipId), 'approved video cannot earn again');
  })));

  test('service bank suffix and withdrawal boundaries reject invalid inputs without reserving funds', async ({ browser }) => fixture(browser, page => page.evaluate(async () => {
    const {service, data, require, rejects, earn, account} = window.domain;
    await earn();
    await rejects(() => service.requestWithdrawal({amount:1000,idempotencyKey:'no-account'}), 'account required');
    for (const last4 of ['12345','123','abcd']) await rejects(() => service.savePayoutAccount({bankCode:data.banks[0].code,holder:'테스터',last4}), 'only exactly four numeric suffix digits permitted');
    await account();
    const before = await service.getServiceState();
    for (const amount of [0,-1,999,1000.5,NaN,Infinity,before.wallet.available+1]) await rejects(() => service.requestWithdrawal({amount,idempotencyKey:`invalid-${amount}`}), 'invalid amount accepted');
    const after = await service.getServiceState();
    require(after.wallet.available === before.wallet.available && after.payouts.length === 0, 'invalid withdrawals must not change money');
  })));

  test('service withdrawal duplicate requests reserve once and failed resolution refunds once', async ({ browser }) => fixture(browser, page => page.evaluate(async () => {
    const {service, require, rejects, earn, account} = window.domain;
    await earn(); await account();
    const before = (await service.getServiceState()).wallet.available;
    const [a,b] = await Promise.all([service.requestWithdrawal({amount:1000,idempotencyKey:'same-withdraw'}),service.requestWithdrawal({amount:1000,idempotencyKey:'same-withdraw'})]);
    require(a.id === b.id, 'duplicate key must return same payout');
    require((await service.getServiceState()).wallet.available === before-1000, 'reserve exactly once');
    await rejects(() => service.deletePayoutAccount(), 'pending payout must block account deletion');
    await Promise.all([service.resolveWithdrawal(a.id,{outcome:'failed'}),service.resolveWithdrawal(a.id,{outcome:'failed'})]);
    const after = await service.getServiceState();
    require(after.wallet.available === before && after.wallet.pendingWithdrawal === 0, 'failed payout must refund once');
    await rejects(() => service.resolveWithdrawal(a.id,{outcome:'completed'}), 'failed payout cannot later complete');
  })));

  test('service completed payout clears reservation without debiting twice', async ({ browser }) => fixture(browser, page => page.evaluate(async () => {
    const {service, require, earn, account} = window.domain;
    await earn(); await account();
    const before = (await service.getServiceState()).wallet.available;
    const payout = await service.requestWithdrawal({amount:1000,idempotencyKey:'complete'});
    await service.resolveWithdrawal(payout.id,{outcome:'completed'});
    await service.resolveWithdrawal(payout.id,{outcome:'completed'});
    const state = await service.getServiceState();
    require(state.wallet.available === before-1000 && state.wallet.totalWithdrawn === 1000 && state.wallet.pendingWithdrawal === 0, 'completion must settle one reserved withdrawal');
  })));

  test('service reward checkout and cancellation each affect balance exactly once', async ({ browser }) => fixture(browser, page => page.evaluate(async () => {
    const {service, data, require, earn} = window.domain;
    const product = data.products.reduce((a,b) => a.price < b.price ? a : b);
    while ((await service.getServiceState()).wallet.available < product.price) await earn();
    const before = (await service.getServiceState()).wallet.available;
    await service.setCartQuantity(product.id,1);
    const [a,b] = await Promise.all([service.checkoutCart({paymentMethod:'reward',idempotencyKey:'order'}),service.checkoutCart({paymentMethod:'reward',idempotencyKey:'order'})]);
    require(a.id === b.id && a.total === product.price, 'checkout must use catalog price and return same order');
    const purchased = await service.getServiceState();
    require(purchased.wallet.available === before-product.price && purchased.cart.length === 0, 'checkout must debit once and empty cart');
    await Promise.all([service.cancelOrder(a.id),service.cancelOrder(a.id)]);
    require((await service.getServiceState()).wallet.available === before, 'cancel must refund exactly once');
  })));

  test('service simultaneous withdrawal and reward checkout cannot overdraw wallet', async ({ browser }) => fixture(browser, page => page.evaluate(async () => {
    const {service, data, require, earn, account} = window.domain;
    const product = data.products.reduce((a,b) => a.price < b.price ? a : b);
    while ((await service.getServiceState()).wallet.available < Math.max(product.price,1000)) await earn();
    await account(); await service.setCartQuantity(product.id,1);
    const before = (await service.getServiceState()).wallet.available;
    const results = await Promise.allSettled([service.requestWithdrawal({amount:before,idempotencyKey:'race-withdraw'}),service.checkoutCart({paymentMethod:'reward',idempotencyKey:'race-order'})]);
    require(results.filter(r => r.status === 'fulfilled').length === 1, 'only one conflicting spend may succeed');
    const state = await service.getServiceState();
    require(state.wallet.available >= 0, 'wallet must not become negative');
    require(state.wallet.available + state.wallet.pendingWithdrawal + state.wallet.totalSpent === before, 'balance must conserve funds across concurrent operations');
  })));

  test('service cart limits reject invalid quantities and demo card does not spend rewards', async ({ browser }) => fixture(browser, page => page.evaluate(async () => {
    const {service, data, require, rejects} = window.domain;
    const product = data.products[0];
    for (const quantity of [-1,0.5,Math.min(product.stock,10)+1]) await rejects(() => service.setCartQuantity(product.id,quantity), 'invalid cart quantity accepted');
    await rejects(() => service.setCartQuantity('missing-product',1), 'unknown product accepted');
    await service.setCartQuantity(product.id,1);
    const order = await service.checkoutCart({paymentMethod:'demo-card',idempotencyKey:'demo-card'});
    const state = await service.getServiceState();
    require(order.total === product.price && state.wallet.available === 0 && state.wallet.totalSpent === 0, 'demo card must not debit reward balance');
  })));
  test('participant UI rejection and resubmission show matching review results in web and app', async ({ browser }) => fixture(browser, async page => {
    const clipId = await page.evaluate(async () => (await window.domain.clip()).id);
    await page.goto(`${baseUrl}/studio/#reviews`);
    const card = page.locator(`[data-review-clip="${clipId}"]`);
    await card.locator('[data-service="submit"]').click();
    await card.getByText('심사 대기', {exact:true}).waitFor();
    await page.locator('[data-service="operator"]').click();
    await page.locator('[data-submission] textarea').fill('손이 화면 밖으로 나갑니다');
    await page.locator('[data-op="reject"]').click();
    await page.locator('[data-submission]').waitFor({state:'detached'});
    await page.locator('[data-service-close]').click();
    await card.getByText('손이 화면 밖으로 나갑니다', {exact:true}).waitFor();
    await card.locator('[data-service="submit"]').click();
    await card.getByText('심사 대기', {exact:true}).waitFor();
    await page.locator('[data-service="operator"]').click();
    await page.locator('[data-op="approve"]').click();
    await page.locator('[data-submission]').waitFor({state:'detached'});
    await page.locator('[data-service-close]').click();
    await card.getByText('통과', {exact:true}).waitFor();
    const app = await page.context().newPage();
    await app.goto(`${baseUrl}/app/#reviews`);
    const appCard = app.locator(`[data-review-clip="${clipId}"]`);
    await appCard.getByText('통과', {exact:true}).waitFor();
    await appCard.locator('summary').click();
    await appCard.getByText(/손이 화면 밖으로 나갑니다/).waitFor();
    assert(await appCard.locator('[data-service="submit"]').count() === 0, 'approved participant video must not offer another submission');
  }));

  test('participant UI account and withdrawal reserve money reflected in the other open surface', async ({ browser }) => fixture(browser, async page => {
    const reward = await page.evaluate(async () => (await window.domain.earn()).reward);
    await page.goto(`${baseUrl}/studio/#wallet`);
    const app = await page.context().newPage();
    await app.goto(`${baseUrl}/app/#wallet`);
    await page.locator('[data-service="account"]').first().click();
    await page.locator('#payout-account-form [name="holder"]').fill('시연 테스터');
    await page.locator('#payout-account-form [name="last4"]').fill('1234');
    await page.locator('#payout-account-form button[type="submit"]').click();
    await page.locator('#payout-account-form').waitFor({state:'detached'});
    await page.locator('[data-service="withdraw"]').click();
    await page.locator('#withdraw-form [name="amount"]').fill('1000');
    await page.locator('#withdraw-form input[type="checkbox"]').check();
    await page.locator('#withdraw-form button[type="submit"]').click();
    await page.getByText('출금 신청을 기록했어요', {exact:true}).waitFor();
    await page.locator('[data-finish]').click();
    const formatted = new Intl.NumberFormat('ko-KR').format(reward-1000);
    await app.locator('#app-wallet [data-wallet-available]').filter({hasText:formatted}).waitFor();
    assert((await app.locator('#app-wallet').innerText()).includes('1234'), 'other surface must show saved masked account');
  }));

  test('participant UI shop checkout and cancellation restore reward balance', async ({ browser }) => fixture(browser, async page => {
    const info = await page.evaluate(async () => {
      const {data, earn, service} = window.domain;
      const product = data.products.reduce((a,b) => a.price < b.price ? a : b);
      while ((await service.getServiceState()).wallet.available < product.price) await earn();
      return {product, before:(await service.getServiceState()).wallet.available};
    });
    await page.goto(`${baseUrl}/app/#shop`);
    await page.locator(`[data-service="add"][data-id="${info.product.id}"]`).click();
    await page.locator('[data-service="checkout"]').click();
    await page.locator('#checkout-form [value="reward"]').check();
    await page.locator('#checkout-form input[type="checkbox"]').check();
    await page.locator('#checkout-form button[type="submit"]').click();
    await page.getByText('시연 주문이 기록됐어요',{exact:true}).waitFor();
    await page.locator('[data-finish]').click();
    await page.locator('[data-service="cancel"]').click();
    await page.locator('.service-order').getByText('취소됨',{exact:true}).waitFor();
    const actual = await page.evaluate(async () => (await (await import('/shared/service-store.js')).getServiceState()).wallet.available);
    assert(actual === info.before, 'UI cancellation must restore purchase cost');
  }));

  test('service changed account invalidates withdrawal confirmation without reserving money', async ({ browser }) => fixture(browser, page => page.evaluate(async () => {
    const {service, data, require, rejects, earn, account} = window.domain;
    await earn();
    const expectedAccount = await account();
    const before = (await service.getServiceState()).wallet.available;
    await service.savePayoutAccount({bankCode:data.banks[0].code,holder:'다른 표시 이름',last4:'9876'});
    await rejects(() => service.requestWithdrawal({amount:1000,idempotencyKey:'stale-account',expectedAccount}), 'old account confirmation must not use replacement account');
    const state = await service.getServiceState();
    require(state.wallet.available === before && state.payouts.length === 0, 'stale confirmation must not reserve funds');
  })));

  test('service identical timestamps still return newest resubmission before rejection history', async ({ browser }) => fixture(browser, page => page.evaluate(async () => {
    const {service, require, clip} = window.domain;
    const original = Date.prototype.toISOString;
    Date.prototype.toISOString = () => '2026-09-08T12:00:00.000Z';
    try {
      const first = await service.submitClip((await clip()).id);
      await service.reviewSubmission(first.id,{decision:'rejected',reason:'다시 검토'});
      const retry = await service.submitClip(first.clipId);
      const state = await service.getServiceState();
      require(state.submissions[0].id === retry.id && state.submissions[1].id === first.id, 'equal timestamps must not hide latest attempt');
    } finally { Date.prototype.toISOString = original; }
  })));

  test('participant UI stale checkout cannot buy a cart changed in another tab', async ({ browser }) => fixture(browser, async page => {
    const product = await page.evaluate(() => window.domain.data.products.reduce((a,b) => a.price < b.price ? a : b));
    await page.goto(`${baseUrl}/app/#shop`);
    await page.locator(`[data-service="add"][data-id="${product.id}"]`).click();
    await page.locator('[data-service="checkout"]').click();
    await page.locator('#checkout-form').waitFor();
    const other = await page.context().newPage();
    await other.goto(`${baseUrl}/studio/#shop`);
    await other.evaluate(async productId => (await import('/shared/service-store.js')).setCartQuantity(productId,3),product.id);
    await page.locator('#checkout-form input[type="checkbox"]').check();
    await page.locator('#checkout-form button[type="submit"]').click();
    await page.locator('#checkout-form [data-service-message]').filter({hasText:/변경/}).waitFor();
    const state = await page.evaluate(async () => (await import('/shared/service-store.js')).getServiceState());
    assert(state.orders.length === 0 && state.wallet.available === 0, 'stale checkout must not place or debit an order');
    assert(state.cart[0].quantity === 3, 'stale checkout must preserve changed cart');
  }));

  test('participant UI stale withdrawal cannot reserve funds for an account changed in another tab', async ({ browser }) => fixture(browser, async page => {
    const before = await page.evaluate(async () => { await window.domain.earn(); await window.domain.account(); return (await window.domain.service.getServiceState()).wallet.available; });
    await page.goto(`${baseUrl}/app/#wallet`);
    await page.locator('#app-wallet [data-service="withdraw"]').click();
    await page.locator('#withdraw-form').waitFor();
    const other = await page.context().newPage();
    await other.goto(`${baseUrl}/studio/#wallet`);
    await other.evaluate(async () => {
      const service = await import('/shared/service-store.js');
      const state = await service.getServiceState();
      await service.savePayoutAccount({...state.account,last4:'9876'});
    });
    await page.locator('#withdraw-form [name="amount"]').fill('1000');
    await page.locator('#withdraw-form input[type="checkbox"]').check();
    await page.locator('#withdraw-form button[type="submit"]').click();
    await page.locator('#withdraw-form [data-service-message]').filter({hasText:/계좌.*변경/}).waitFor();
    const state = await page.evaluate(async () => (await import('/shared/service-store.js')).getServiceState());
    assert(state.payouts.length === 0 && state.wallet.available === before, 'stale withdrawal confirmation must not reserve money');
  }));

}
