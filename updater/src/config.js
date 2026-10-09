const identifier=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const repository=/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export function loadConfig(env=process.env){
 if(!env.PORTAINER_API_KEY)throw new Error('PORTAINER_API_KEY is required');
 if(/[\r\n]/.test(env.PORTAINER_API_KEY)||env.PORTAINER_API_KEY.length>4096)throw new Error('PORTAINER_API_KEY is invalid');
 if(!env.UPDATER_PASSWORD)throw new Error('UPDATER_PASSWORD is required');
 if(env.UPDATER_PASSWORD.length<16)throw new Error('UPDATER_PASSWORD must be at least 16 characters');
 if(!env.PORTAINER_URL)throw new Error('PORTAINER_URL is required');
 const portainerUrl=env.PORTAINER_URL;
 const parsed=new URL(portainerUrl);
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('PORTAINER_URL must be a plain HTTPS origin');
 const targetContainer=env.TARGET_CONTAINER||'bimola';
 const githubRepository=env.GITHUB_REPOSITORY||'vyslbysl/BiMola';
 const branch=env.GITHUB_BRANCH||'main';
 if(!identifier.test(targetContainer))throw new Error('TARGET_CONTAINER is invalid');
 if(!repository.test(githubRepository))throw new Error('GITHUB_REPOSITORY is invalid');
 if(!identifier.test(branch))throw new Error('GITHUB_BRANCH is invalid');
 const listenPort=Number(env.PORT||8080);
 if(!Number.isInteger(listenPort)||listenPort<1||listenPort>65535)throw new Error('PORT is invalid');
 return {
  portainerUrl:parsed.origin,portainerApiKey:env.PORTAINER_API_KEY,
  rejectUnauthorized:env.PORTAINER_TLS_VERIFY==='true',
  repository:githubRepository,branch,targetContainer,listenPort,
  password:env.UPDATER_PASSWORD,githubToken:env.GITHUB_TOKEN||'',
  healthTimeoutMs:Math.max(30000,Math.min(300000,Number(env.HEALTH_TIMEOUT_MS)||90000)),
  buildTimeoutMs:Math.max(60000,Math.min(1800000,Number(env.BUILD_TIMEOUT_MS)||900000))
 };
}
