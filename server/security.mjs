import {randomBytes, createHash, scrypt, timingSafeEqual, createCipheriv, createDecipheriv} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export const token=()=>randomBytes(32).toString('base64url');
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const id=prefix=>`${prefix}_${randomBytes(12).toString('hex')}`;
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');return `${salt}:${(await derive(password,salt,64,{N:16384,r:8,p:1})).toString('hex')}`;}
export async function verifyPassword(password,encoded){try{const [salt,hash]=encoded.split(':');const actual=await derive(password,salt,64,{N:16384,r:8,p:1});const expected=Buffer.from(hash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}catch{return false;}}
export function seal(value,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(x=>x.toString('base64')).join('.');}
export function unseal(value,key){const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64'));const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAuthTag(tag);return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8'));}
export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
export function fail(status,message){throw new HttpError(status,message);}
export function str(value,label,max=500,min=1){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(400,`${label}을(를) 확인해주세요.`);return value.trim();}
export function integer(value,label,min=0,max=1000000000){if(!Number.isSafeInteger(value)||value<min||value>max)fail(400,`${label}을(를) 확인해주세요.`);return value;}
export function choice(value,values,label){if(!values.includes(value))fail(400,`${label}을(를) 확인해주세요.`);return value;}
export function email(value){const result=str(value,'이메일',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))fail(400,'이메일 주소를 확인해주세요.');return result;}
export function password(value){if(typeof value!=='string'||value.length<12||value.length>128)fail(400,'비밀번호는 12~128자로 입력해주세요.');return value;}
export function csv(rows){const cell=v=>{let s=String(v??'');if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');}
