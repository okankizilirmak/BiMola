import https from 'node:https';

export class PortainerClient{
 constructor({baseUrl,apiKey,rejectUnauthorized=true,defaultTimeout=30000}){this.base=new URL(baseUrl);this.apiKey=apiKey;this.rejectUnauthorized=rejectUnauthorized;this.defaultTimeout=defaultTimeout;}
 request(method,path,{body,headers={},timeout=this.defaultTimeout,maxBytes=16*1024*1024}={}){
  if(!path.startsWith('/api/'))throw new Error('Portainer path must start with /api/');
  return new Promise((resolve,reject)=>{
   const request=https.request({protocol:this.base.protocol,hostname:this.base.hostname,port:this.base.port,path,method,rejectUnauthorized:this.rejectUnauthorized,headers:{'X-API-Key':this.apiKey,...headers}},response=>{
    const chunks=[];let size=0;
    response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){request.destroy(new Error('Portainer response exceeded size limit'));return;}chunks.push(chunk);});
    response.on('end',()=>{const data=Buffer.concat(chunks),text=data.toString('utf8');if(response.statusCode<200||response.statusCode>=300)return reject(new Error(`Portainer ${method} ${path.split('?')[0]} returned ${response.statusCode}: ${text.slice(0,300)}`));resolve({status:response.statusCode,headers:response.headers,data,text});});
   });
   request.setTimeout(timeout,()=>request.destroy(new Error(`Portainer request timed out after ${timeout}ms`)));
   request.on('error',reject);if(body)request.write(body);request.end();
  });
 }
 async json(method,path,options={}){const payload=options.body!==undefined?Buffer.from(JSON.stringify(options.body)):undefined;const response=await this.request(method,path,{...options,body:payload,headers:{...(payload?{'Content-Type':'application/json','Content-Length':payload.length}:{}),...options.headers}});return response.data.length?JSON.parse(response.text):null;}
 docker(endpointId,method,path,options={}){return this.json(method,`/api/endpoints/${encodeURIComponent(endpointId)}/docker${path}`,options);}
}
