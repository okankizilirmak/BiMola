import {timingSafeEqual} from 'node:crypto';

const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};

export function isAuthorized(value,password){
 if(typeof value!=='string'||!value.startsWith('Basic '))return false;
 try{const decoded=Buffer.from(value.slice(6),'base64').toString('utf8'),at=decoded.indexOf(':');return at>=0&&equal(decoded.slice(at+1),password);}catch{return false;}
}

export function isSameOrigin(origin,host){
 if(!origin||!host)return false;
 try{const url=new URL(origin);return (url.protocol==='http:'||url.protocol==='https:')&&url.host===host;}catch{return false;}
}
