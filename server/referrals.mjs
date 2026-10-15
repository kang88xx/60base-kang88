import {randomBytes} from 'node:crypto';
import {fail,id} from './security.mjs';

export function createReferralService(store,origin){
 const {one,run,now,transaction}=store;
 const eligibleAccount=userId=>!!one("SELECT id FROM users WHERE id=? AND status='active' AND NOT EXISTS (SELECT 1 FROM account_deletions WHERE userId=users.id)",userId);
 // Ledger remains authoritative even after approved media is removed.
 const hasApproved=(userId,except='')=>!!one("SELECT id FROM ledger WHERE userId=? AND kind='reward' AND reference!=? UNION ALL SELECT id FROM videos WHERE userId=? AND status='approved' AND id!=? LIMIT 1",userId,except,userId,except);
 function ownCode(userId){
  const saved=one('SELECT code FROM referral_codes WHERE userId=?',userId);if(saved)return saved.code;
  for(let attempt=0;attempt<10;attempt++){
   const code=randomBytes(9).toString('hex').toUpperCase();
   if(run('INSERT OR IGNORE INTO referral_codes VALUES(?,?,?)',userId,code,now()).changes)return code;
   const existing=one('SELECT code FROM referral_codes WHERE userId=?',userId);if(existing)return existing.code;
  }
  fail(503,'초대 코드를 생성하지 못했습니다. 다시 시도해주세요.');
 }
 function snapshot(userId){
  const code=ownCode(userId),attribution=one('SELECT rewardedAt FROM referrals WHERE inviteeId=?',userId),unavailable=!!one('SELECT inviteeId FROM referral_claim_tombstones WHERE inviteeId=?',userId);
  const counts=one('SELECT COUNT(*) invitedCount,COUNT(rewardedAt) rewardedCount FROM referrals WHERE inviterId=?',userId);
  const earnedPoints=one("SELECT COALESCE(SUM(amount),0) amount FROM ledger WHERE userId=? AND kind='referral'",userId).amount;
  const claimUnavailableReason=!eligibleAccount(userId)?'account_unavailable':attribution||unavailable?'already_claimed':hasApproved(userId)?'first_video_approved':null;
  return {code,shareUrl:new URL('/app/?ref='+code+'#profile',origin).href,rewardPoints:1000,...counts,earnedPoints,canClaim:claimUnavailableReason===null,attribution:attribution?{status:attribution.rewardedAt?'rewarded':'pending'}:unavailable?{status:'unavailable'}:null,claimUnavailableReason};
 }
 function claim(userId,value){return transaction(()=>{
  if(typeof value!=='string'||!value.trim()||value.trim().length>100)fail(400,'초대 코드를 확인해주세요.');
  const code=value.trim().toUpperCase();
  if(!eligibleAccount(userId))fail(409,'삭제 요청 중인 계정은 초대 코드를 등록할 수 없습니다.');
  const inviter=one('SELECT userId FROM referral_codes WHERE code=?',code);
  if(!inviter||!eligibleAccount(inviter.userId))fail(400,'사용할 수 없는 초대 코드입니다.');
  if(inviter.userId===userId)fail(400,'본인의 초대 코드는 등록할 수 없습니다.');
  const existing=one('SELECT inviterId FROM referrals WHERE inviteeId=?',userId);
  if(existing){if(existing.inviterId!==inviter.userId)fail(409,'이미 다른 초대 코드를 등록했습니다.');return snapshot(userId);}
  if(one('SELECT inviteeId FROM referral_claim_tombstones WHERE inviteeId=?',userId))fail(409,'이미 초대 코드를 등록했습니다.');
  if(hasApproved(userId))fail(409,'첫 영상이 통과하기 전에 초대 코드를 등록해주세요.');
  run('INSERT INTO referrals(id,inviteeId,inviterId,createdAt) VALUES(?,?,?,?)',id('ref'),userId,inviter.userId,now());
  return snapshot(userId);
 });}
 // Called only inside the final-review transaction. The opaque reference contains no member ID.
 function reward(userId,reviewedAt){
  const relation=one('SELECT * FROM referrals WHERE inviteeId=? AND rewardedAt IS NULL',userId);
  if(!relation||!eligibleAccount(userId)||!eligibleAccount(relation.inviterId))return;
  run('INSERT OR IGNORE INTO ledger VALUES(?,?,?,?,?,?)',id('led'),relation.inviterId,1000,'referral','referral:'+relation.id,reviewedAt);
  run('UPDATE referrals SET rewardedAt=? WHERE id=? AND rewardedAt IS NULL',reviewedAt,relation.id);
 }
 return {get:userId=>transaction(()=>snapshot(userId)),claim,hasApproved,reward};
}
