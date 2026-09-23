import { Transaction } from "@mysten/sui/transactions";
const URL_="https://mainnet.suiet.app";
async function rpc(method:string,params:any[]){const r=await fetch(URL_,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});const j:any=await r.json();if(j.error)throw new Error(JSON.stringify(j.error));return j.result;}
async function ref(id:string){const d=await rpc("sui_getObject",[id,{showOwner:true,showType:true}]);const o=d.data;return {objectId:o.objectId,version:String(o.version),digest:o.digest,owner:o.owner,type:o.type};}
const sender="0x489e7b801fa43b8ba11038733e3909d3cdd6db3c21bd0e80dc9704f77c148f7d";
const pkg="0x70a9b28a28c028e5ab9ed9fefec26f1fc43918bc094d60527b8968fb4f5ab0b5";
const coinType="0x1eb3947ac89ea9b58d6ed0fbec4534ae50205dc80c45e019d553381a9b3a0520::suipump::SUIPUMP";
const t=await ref("0xd10d2793b77932eddac6a8dae8bb5cc6b4fc090049bbb7ffbfa07befe3644e44");
const c=await ref("0x03b8007014a39411da697fb4d7d7d9268324518ca9236f7cc8c19ec3c63ba77b");
const reg=await ref("0xb622741bfcfd6ef13b40c2d5c2adc8d796f68b3b1254fabaa571bffa3a91e875");
const clock=await ref("0x0000000000000000000000000000000000000000000000000000000000000006");
console.log("ticket",t.type,"reg owner",JSON.stringify(reg.owner));
const gas=await ref("0x8f6850ac66db6007cd5c1f76a4995d0481cc8ca0fb9f1c3fe3072a1af5211b52");
const tx=new Transaction();
tx.setSender(sender);tx.setGasPrice(750);tx.setGasBudget(500_000_000);
tx.setGasPayment([{objectId:gas.objectId,version:gas.version,digest:gas.digest}]);
const [fee]=tx.splitCoins(tx.gas,[2_000_000_000n]);
const r=tx.moveCall({target:`${pkg}::bonding_curve::create_and_return`,typeArguments:[coinType],arguments:[
 tx.objectRef({objectId:t.objectId,version:t.version,digest:t.digest}),
 tx.sharedObjectRef({objectId:reg.objectId,initialSharedVersion:String(reg.owner.Shared.initial_shared_version),mutable:false}),
 tx.objectRef({objectId:c.objectId,version:c.version,digest:c.digest}),
 fee!,
 tx.pure.string("Test"),tx.pure.string("TEST"),tx.pure.string("desc"),
 tx.pure.vector("address",[sender]),tx.pure.vector("u64",[10000n]),
 tx.pure.u8(0),tx.pure.u8(0),
 tx.sharedObjectRef({objectId:clock.objectId,initialSharedVersion:String(clock.owner.Shared.initial_shared_version),mutable:false})]});
tx.moveCall({target:`${pkg}::bonding_curve::share_curve`,typeArguments:[coinType],arguments:[r[0]!]});
tx.transferObjects([r[1]!],sender);
const bytes=await tx.build();
const res=await rpc("sui_dryRunTransactionBlock",[Buffer.from(bytes).toString("base64")]);
console.log(JSON.stringify(res.effects.status));
