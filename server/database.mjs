import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {id,fail,seal,unseal} from './security.mjs';
export function openDatabase(directory){
 mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
 for(const folder of ['videos','uploads','backups'])mkdirSync(path.join(directory,folder),{recursive:true,mode:0o700});
 const keyFile=path.join(directory,'encryption.key');if(!existsSync(keyFile))writeFileSync(keyFile,randomBytes(32),{mode:0o600,flag:'wx'});
 const key=readFileSync(keyFile);if(key.length!==32)throw Error('Invalid encryption key');
 const db=new DatabaseSync(path.join(directory,'dongjakso.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;');
 db.exec(`
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',status TEXT NOT NULL DEFAULT 'active',createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',consent TEXT NOT NULL DEFAULT '{}',bank TEXT,forcePassword INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expiresAt INTEGER NOT NULL,createdAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,untilAt INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,instructions TEXT NOT NULL,reward INTEGER NOT NULL,published INTEGER NOT NULL DEFAULT 0,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),metadata TEXT NOT NULL,total INTEGER NOT NULL,received INTEGER NOT NULL DEFAULT 0,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS upload_chunks(uploadId TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,offset INTEGER NOT NULL,size INTEGER NOT NULL,sha TEXT NOT NULL,PRIMARY KEY(uploadId,offset));
 CREATE TABLE IF NOT EXISTS hf_garbage(key TEXT PRIMARY KEY,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS apple_refresh_tokens(firebaseUid TEXT PRIMARY KEY,clientId TEXT NOT NULL,subject TEXT NOT NULL,tokenCiphertext TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_identities(provider TEXT NOT NULL,uid TEXT NOT NULL,userId TEXT NOT NULL UNIQUE REFERENCES users(id),createdAt TEXT NOT NULL,PRIMARY KEY(provider,uid));
 CREATE TABLE IF NOT EXISTS videos(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),taskId TEXT NOT NULL REFERENCES tasks(id),title TEXT NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,duration REAL NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,reward INTEGER NOT NULL,captureTask TEXT NOT NULL DEFAULT '{}',path TEXT NOT NULL,sha TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'uploaded',reviewStage TEXT NOT NULL DEFAULT 'ai',revision INTEGER NOT NULL DEFAULT 0,createdAt TEXT NOT NULL,submittedAt TEXT,reviewedAt TEXT,reason TEXT NOT NULL DEFAULT '',checks TEXT NOT NULL DEFAULT '{}',consent TEXT NOT NULL DEFAULT '{}',UNIQUE(userId,sha));
 CREATE TABLE IF NOT EXISTS cleanup_jobs(videoId TEXT PRIMARY KEY REFERENCES videos(id),file TEXT NOT NULL,createdAt TEXT NOT NULL,lastError TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,videoId TEXT NOT NULL REFERENCES videos(id),actorId TEXT NOT NULL REFERENCES users(id),stage TEXT NOT NULL DEFAULT 'legacy',decision TEXT NOT NULL,reason TEXT NOT NULL,checks TEXT NOT NULL,revision INTEGER NOT NULL,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,kind TEXT NOT NULL,reference TEXT NOT NULL UNIQUE,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS payouts(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,bank TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',reference TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',createdAt TEXT NOT NULL,resolvedAt TEXT);
 CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,price INTEGER NOT NULL,stock INTEGER NOT NULL DEFAULT 0,published INTEGER NOT NULL DEFAULT 0,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),items TEXT NOT NULL,total INTEGER NOT NULL,method TEXT NOT NULL,status TEXT NOT NULL,reference TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,kind TEXT NOT NULL,category TEXT NOT NULL,amount INTEGER NOT NULL,party TEXT NOT NULL,reference TEXT NOT NULL,note TEXT NOT NULL,date TEXT NOT NULL,createdAt TEXT NOT NULL,actorId TEXT NOT NULL REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id),subject TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',response TEXT NOT NULL DEFAULT '',createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS announcements(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 0,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS annotations(id TEXT PRIMARY KEY,videoId TEXT NOT NULL REFERENCES videos(id),start REAL NOT NULL,end REAL NOT NULL,label TEXT NOT NULL,note TEXT NOT NULL,actorId TEXT NOT NULL REFERENCES users(id),createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actorId TEXT,action TEXT NOT NULL,target TEXT NOT NULL,detail TEXT NOT NULL,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS requests(userId TEXT NOT NULL,kind TEXT NOT NULL,key TEXT NOT NULL,payload TEXT NOT NULL,responseId TEXT NOT NULL,createdAt TEXT NOT NULL,PRIMARY KEY(userId,kind,key));
 CREATE TABLE IF NOT EXISTS account_deletions(id TEXT PRIMARY KEY,userId TEXT NOT NULL UNIQUE REFERENCES users(id),status TEXT NOT NULL DEFAULT 'pending',stage TEXT NOT NULL DEFAULT 'requested',createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,completedAt TEXT,actorId TEXT,attempts INTEGER NOT NULL DEFAULT 0,lastError TEXT NOT NULL DEFAULT '',evidence TEXT NOT NULL DEFAULT '{}');
 CREATE TABLE IF NOT EXISTS account_deletion_files(requestId TEXT NOT NULL REFERENCES account_deletions(id),kind TEXT NOT NULL,file TEXT NOT NULL,removed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(requestId,kind,file));
 CREATE TABLE IF NOT EXISTS finance_events(id TEXT PRIMARY KEY,kind TEXT NOT NULL,amount INTEGER NOT NULL,method TEXT NOT NULL,reference TEXT NOT NULL UNIQUE,createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS videos_user ON videos(userId,createdAt);CREATE INDEX IF NOT EXISTS videos_status ON videos(status,submittedAt);CREATE INDEX IF NOT EXISTS reviews_video ON reviews(videoId,createdAt);CREATE INDEX IF NOT EXISTS ledger_user ON ledger(userId,createdAt);CREATE INDEX IF NOT EXISTS audit_time ON audit(createdAt);
 `);
 const videoColumns=db.prepare('PRAGMA table_info(videos)').all();
 if(!videoColumns.some(c=>c.name==='captureTask'))db.exec("ALTER TABLE videos ADD COLUMN captureTask TEXT NOT NULL DEFAULT '{}'");
 if(!videoColumns.some(c=>c.name==='reviewStage'))db.exec("ALTER TABLE videos ADD COLUMN reviewStage TEXT NOT NULL DEFAULT 'ai'");
 if(!db.prepare('PRAGMA table_info(reviews)').all().some(c=>c.name==='stage'))db.exec("ALTER TABLE reviews ADD COLUMN stage TEXT NOT NULL DEFAULT 'legacy'");
 db.exec("UPDATE videos SET reviewStage='complete' WHERE status='approved' AND reviewStage!='complete'");
 let revision=0;
 const run=(sql,...args)=>{const result=db.prepare(sql).run(...args);if(result.changes)revision++;return result;},one=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args);
 const now=()=>new Date().toISOString();
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
 const audit=(actor,action,target,detail={})=>run('INSERT INTO audit VALUES(?,?,?,?,?,?)',id('evt'),actor?.id||null,action,target,JSON.stringify(detail),now());
 const defaults={operatorName:'60BASE',contactEmail:'60base.ai@gmail.com',notice:'',intakeOpen:true,shopOpen:false,maxVideoBytes:524288000,totalStorageBytes:10737418240,memberStorageBytes:2147483648,consentVersion:'2026-09-14',payoutMinimum:3000};
 for(const [k,v] of Object.entries(defaults))run('INSERT OR IGNORE INTO settings VALUES(?,?)',k,JSON.stringify(v));
 for(const [slug,title,category,safety=''] of [['dishwashing','설거지','주방'],['cutting-vegetables','채소 손질','주방'],['folding-clothes','빨래 개기','세탁·의류'],['plants','식물 물주기','정원·베란다'],['bedroom','침대 정돈','침실'],['dining','식탁 정리','다이닝'],['simple-cooking','간단한 요리','주방',' 뜨거운 조리도구를 다룰 때는 안전을 먼저 확인합니다.'],['car-interior','자동차 내부 청소','기타',' 차량번호, 주소, 출입증이 보이지 않게 합니다. 운전 중 촬영하지 않고 정차 상태에서만 진행합니다.']])run('INSERT OR IGNORE INTO tasks VALUES(?,?,?,?,?,?,?,?)',slug,title,category,'본인 자택에서 헤드기어형 카메라를 착용하고 가로 화면으로 약 5분 촬영합니다. 손과 작업 대상이 화면에 들어오도록 하며, 타인의 얼굴·사적 대화·개인정보가 포함되지 않도록 확인해주세요.'+safety,3000,1,now(),now());
 const settings=()=>Object.fromEntries(all('SELECT * FROM settings').map(r=>[r.key,JSON.parse(r.value)]));
 const wallet=userId=>{const earned=one("SELECT COALESCE(SUM(amount),0) total FROM ledger WHERE userId=?",userId).total;const paid=one("SELECT COALESCE(SUM(amount),0) total FROM payouts WHERE userId=? AND status='paid'",userId).total;const pending=one("SELECT COALESCE(SUM(amount),0) total FROM payouts WHERE userId=? AND status='pending'",userId).total;return {balance:earned-paid,available:earned-paid-pending,pending,paid,earned:one("SELECT COALESCE(SUM(amount),0) total FROM ledger WHERE userId=? AND kind='reward'",userId).total};};
 function publicUser(user){if(!user)return null;return {id:user.id,email:user.email,name:user.name,role:user.role,status:user.status,createdAt:user.createdAt,forcePassword:!!user.forcePassword,bank:user.bank?maskBank(unseal(user.bank,key)):null};}
 function maskBank(bank){return {bank:bank.bank,holder:bank.holder,last4:bank.number.slice(-4)};}
 return {db,directory,run,one,all,now,transaction,audit,settings,wallet,publicUser,seal:value=>seal(value,key),unseal:value=>unseal(value,key),maskBank,get revision(){return revision;}};
}
