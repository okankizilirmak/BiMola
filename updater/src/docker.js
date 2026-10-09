// CapAdd/CapDrop are intentionally omitted. Portainer CE treats their presence as a
// capabilities request, even when Docker inspect returned null, and blocks it for standard users.
const hostKeys=['Binds','Mounts','PortBindings','RestartPolicy','NetworkMode','LogConfig','SecurityOpt','ReadonlyRootfs','Privileged','AutoRemove','Dns','DnsOptions','DnsSearch','ExtraHosts','Devices','DeviceRequests','Memory','MemorySwap','MemoryReservation','NanoCpus','CpuShares','CpusetCpus','PidsLimit','ShmSize','Ulimits','Init'];
const configKeys=['Env','Cmd','Entrypoint','WorkingDir','User','Labels','ExposedPorts','Healthcheck','StopSignal','StopTimeout','Tty','OpenStdin','StdinOnce','AttachStdin','AttachStdout','AttachStderr','Domainname','MacAddress'];

export function findTarget(endpointContainers,name){
 const matches=[];
 for(const endpoint of endpointContainers)for(const container of endpoint.containers||[])if((container.Names||[]).includes('/'+name))matches.push({endpointId:endpoint.endpointId,containerId:container.Id});
 if(matches.length>1)throw new Error(`Found multiple containers named ${name}`);
 if(!matches.length)throw new Error(`Container ${name} was not found in accessible environments`);
 return matches[0];
}

export function replacementConfig(inspect,image){
 const body={Image:image};
 for(const key of configKeys)if(inspect.Config?.[key]!==undefined)body[key]=inspect.Config[key];
 const host={};for(const key of hostKeys)if(inspect.HostConfig?.[key]!==undefined)host[key]=inspect.HostConfig[key];
 const scoreMount=inspect.Mounts?.find(mount=>mount.Type==='volume'&&mount.Destination==='/app/data'&&mount.Name);
 const scoreConfigured=host.Binds?.some(bind=>bind.split(':')[1]==='/app/data')||host.Mounts?.some(mount=>mount.Target==='/app/data');
 if(scoreMount&&!scoreConfigured)host.Mounts=[...(host.Mounts||[]),{Type:'volume',Source:scoreMount.Name,Target:'/app/data',ReadOnly:!scoreMount.RW}];
 host.AutoRemove=false;body.HostConfig=host;
 const EndpointsConfig={};
 for(const [name,value]of Object.entries(inspect.NetworkSettings?.Networks||{}))EndpointsConfig[name]={Aliases:value.Aliases||undefined,Links:value.Links||undefined,IPAMConfig:value.IPAMConfig||undefined};
 return {body,networking:{EndpointsConfig}};
}

export function candidateConfig(inspect,image){
 const {body}=replacementConfig(inspect,image);
 body.HostConfig={NetworkMode:'none',RestartPolicy:{Name:'no'},AutoRemove:false};
 return body;
}
