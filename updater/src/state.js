export class DeploymentState{
 constructor(limit=200){this.limit=limit;this.running=false;this.stage='idle';this.logs=[];this.lastSuccess=null;this.lastError=null;}
 begin(){if(this.running)return false;this.running=true;this.stage='starting';this.lastError=null;this.logs=[];this.startedAt=new Date().toISOString();return true;}
 setStage(stage){this.stage=stage;this.log(stage);}
 log(message){this.logs.push({at:new Date().toISOString(),message:String(message).replace(/[\r\n]+/g,' ').slice(0,500)});if(this.logs.length>this.limit)this.logs.splice(0,this.logs.length-this.limit);}
 finish(result){this.running=false;this.stage='complete';this.finishedAt=new Date().toISOString();this.lastSuccess={...result,at:this.finishedAt};}
 fail(error){this.running=false;this.stage='failed';this.finishedAt=new Date().toISOString();this.lastError={message:error instanceof Error?error.message:String(error),at:this.finishedAt};this.log('Hata: '+this.lastError.message);}
 snapshot(){return {running:this.running,stage:this.stage,startedAt:this.startedAt,finishedAt:this.finishedAt,lastSuccess:this.lastSuccess,lastError:this.lastError,logs:[...this.logs]};}
}
