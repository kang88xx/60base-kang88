// A completed provider login alone is not an application server session.
export function canEnterApp(state) {
  return state?.access === 'allowed' && state.online === true && state.user?.operations === true && state.sessionChecking !== true;
}

export function checkingAppAccess(state) {
  return !canEnterApp(state) && (state?.access === 'checking' || state?.accountConnecting === true || state?.sessionChecking === true);
}
