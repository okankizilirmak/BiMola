import {mkdtemp,writeFile,stat,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';

const DEPLOY_DOCKERFILE=`FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY server.js ./
COPY server ./server
COPY public ./public
COPY test ./test
COPY Dockerfile .dockerignore ./
RUN npm test && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/server.js ./
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /app/data && chown node:node /app/data
ENV BIMOLA_DATA_DIR=/app/data
VOLUME ["/app/data"]
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=6 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
`;

const DEPLOY_DOCKERIGNORE=`node_modules
.git
*.tar
`;

export async function writeBuildFiles(checkout){
 await writeFile(join(checkout,'Dockerfile.updater'),DEPLOY_DOCKERFILE,{mode:0o600});
 await writeFile(join(checkout,'Dockerfile.updater.dockerignore'),DEPLOY_DOCKERIGNORE,{mode:0o600});
}

function run(command,args,{cwd,env=process.env,timeout=120000}={}){return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd,env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);child.stdout.on('data',v=>stdout=(stdout+v).slice(-20000));child.stderr.on('data',v=>stderr=(stderr+v).slice(-20000));child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout.trim()):reject(new Error(`${command} failed (${code}): ${stderr.slice(-1000)}`));});});}

export async function prepareSource({repository,branch,githubToken=''}){
 const root=await mkdtemp(join(tmpdir(),'bimola-updater-')),checkout=join(root,'source'),archive=join(root,'context.tar.gz');
 const repoUrl=`https://github.com/${repository}.git`;
 const env={...process.env,GIT_TERMINAL_PROMPT:'0'};
 if(githubToken)env.GIT_CONFIG_COUNT='1',env.GIT_CONFIG_KEY_0='http.extraHeader',env.GIT_CONFIG_VALUE_0=`Authorization: Bearer ${githubToken}`;
 try{
  await run('git',['clone','--depth','1','--single-branch','--branch',branch,repoUrl,checkout],{env,timeout:180000});
  const commit=await run('git',['rev-parse','HEAD'],{cwd:checkout});
  if(!/^[0-9a-f]{40}$/.test(commit))throw new Error('Git returned an invalid commit');
  await writeBuildFiles(checkout);
  await run('tar',['-czf',archive,'--exclude=.git','--exclude=*.tar','-C',checkout,'.'],{timeout:120000});
  const info=await stat(archive);if(info.size>128*1024*1024)throw new Error('Build context exceeded 128 MiB');
  return {commit,archive:await readFile(archive),cleanup:()=>rm(root,{recursive:true,force:true})};
 }catch(error){await rm(root,{recursive:true,force:true});throw error;}
}
