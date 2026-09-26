// Host-only recovery after the operator verifies account ownership.
import path from 'node:path';
import os from 'node:os';
import {writeFileSync} from 'node:fs';
import {openDatabase} from '../server/database.mjs';
import {hashPassword,token,email} from '../server/security.mjs';
const mail=email(process.argv[2]),directory=path.resolve(process.env.DONGJAKSO_DATA_DIR||path.join(os.homedir(),'.local/share/dongjakso'));
const store=openDatabase(directory);
try{const user=store.one('SELECT * FROM users WHERE email=?',mail);if(!user)throw Error('해당 계정을 찾을 수 없습니다.');const password=token().slice(0,24),hash=await hashPassword(password);store.transaction(()=>{store.run('UPDATE users SET password=?,forcePassword=1,updatedAt=? WHERE id=?',hash,store.now(),user.id);store.run('DELETE FROM sessions WHERE userId=?',user.id);store.audit(null,'account.host-password-reset',user.id);});const file=path.join(directory,'recovery-'+user.id+'.txt');writeFileSync(file,`계정: ${mail}\n임시 비밀번호: ${password}\n로그인 후 즉시 변경해주세요.\n`,{mode:0o600});console.log('복구 정보 저장: '+file);}finally{store.db.close();}
