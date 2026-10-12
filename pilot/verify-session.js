export async function verifySession({ user, memberId, hintMemberId, read, staticMembers, adminUid, adminMemberId = 'member_9', isCurrent = () => true }) {
  if (!user || user.isAnonymous) throw Error('AUTH_REQUIRED');
  const token = await user.getIdTokenResult();
  const authTime = Number(token.claims.auth_time);
  if (token.signInProvider !== 'password' || !Number.isSafeInteger(authTime)) throw Error('UNTRUSTED_ACCOUNT');
  const isAdmin = user.uid === adminUid;
  const readMember = id => Promise.all([
    isAdmin ? null : read('memberAccounts', id), isAdmin ? null : read('memberRegistry', id),
    read('featuredMembers', 'custom__' + id), read('featuredMembers', 'hidden__' + id), read('memberPermissions', id),
  ]).then(values=>({values}),error=>({error}));
  // A hint only starts reads sooner; the server binding still establishes identity.
  const candidate = isAdmin ? adminMemberId : memberId || hintMemberId;
  const prefetched = candidate ? readMember(candidate) : null;
  const binding = isAdmin ? null : await read('accountBindings', user.uid);
  const id = isAdmin ? adminMemberId : binding?.memberId;
  if (!id || (memberId && memberId !== id) || (!isAdmin && (binding.schemaVersion !== 1 || binding.active !== true
    || !Number.isSafeInteger(binding.authValidAfter) || authTime < binding.authValidAfter))) throw Error('UNTRUSTED_ACCOUNT');
  const result = await (candidate === id ? prefetched : readMember(id));
  if(result.error)throw result.error;
  const [account, registry, profile, hidden, permission] = result.values;
  const fixed = staticMembers.find(m => m.id === id);
  if (!isCurrent() || (!isAdmin && (hidden || account?.uid !== user.uid || account.schemaVersion !== 1
    || registry?.memberId !== id || registry.schemaVersion !== 1 || registry.active !== true
    || !['cloud', 'static'].includes(registry.source) || (registry.source === 'cloud' && !profile)
    || (registry.source === 'static' && !fixed))) || (profile && profile.memberId !== id)) throw Error('STALE_OR_INVALID_SESSION');
  const source = profile || fixed;
  if (!source?.name || !source?.src) throw Error('MEMBER_PROFILE_MISSING');
  return { uid: user.uid, member: { id, name: source.name, src: source.src, kind: 'member' }, isAdmin, authTime,
    permissions: { qa: isAdmin || permission?.qa === true, memberStatus: isAdmin || permission?.memberStatus === true,
      ahd: isAdmin || permission?.ahd === true } };
}
