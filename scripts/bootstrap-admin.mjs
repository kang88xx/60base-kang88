import path from 'node:path';
import os from 'node:os';
import {writeFileSync,existsSync} from 'node:fs';
import {openDatabase} from '../server/database.mjs';
import {id,hashPassword,token,email} from '../server/security.mjs';
const directory=path.resolve(process.env.DONGJAKSO_DATA_DIR||path.join(os.homedir(),'.local/share/dongjakso'));
const store=openDatabase(directory),mail=email(process.env.DONGJAKSO_ADMIN_EMAIL||'60base.ai@gmail.com');
try{
 if(store.one("SELECT id FROM users WHERE role='admin'")){console.log('관리자가 이미 있습니다. 기존 비밀번호를 변경하지 않았습니다.');}
 else{const password=token().slice(0,24),uid=id('usr'),at=store.now();store.run("INSERT INTO users(id,email,password,name,role,status,createdAt,updatedAt,forcePassword) VALUES(?,?,?,?,?,?,?,?,?)",uid,mail,await hashPassword(password),'운영 관리자','admin','active',at,at,1);store.audit({id:uid},'admin.bootstrap',uid);const access=path.join(directory,'admin-access.txt');writeFileSync(access,`동작소 관리자 초기 접속\n주소: http://localhost:4318/admin/\n이메일: ${mail}\n임시 비밀번호: ${password}\n첫 로그인 후 비밀번호를 변경해야 관리할 수 있습니다.\n이 파일은 공개 배포 및 Git에 포함되지 않습니다.\n`,{mode:0o600,flag:'wx'});console.log(`관리자를 생성했습니다. 개인 접속 안내: ${access}`);}
}finally{store.db.close();}
