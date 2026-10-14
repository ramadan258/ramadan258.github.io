export function normalizeLoginName(input) {
  if (typeof input !== 'string' || /[\p{Cc}\p{Cf}]/u.test(input)) throw Error('INVALID_NAME');
  const display = input.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (display.length < 2 || display.length > 60 || !/^[A-Za-z\p{Script=Arabic}\u064b-\u065f\u06700-9 _-]+$/u.test(display)) throw Error('INVALID_NAME');
  const key = display.toLocaleLowerCase('en-US').replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/[ىی]/g, 'ي').replace(/ک/g, 'ك')
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0));
  if (key.length < 2) throw Error('INVALID_NAME');
  return {display, key};
}
export function findLoginMember(name,members) {
  const key=normalizeLoginName(name).key;
  const matches=members.filter(m=>/^custom_member_new_[a-f0-9]{32}$/.test(m.memberId||'')&&m.schemaVersion===2&&m.managementState==='ready'&&normalizeLoginName(m.name).key===key);
  if(matches.length!==1)throw Error('LOGIN_REJECTED');return matches[0];
}
