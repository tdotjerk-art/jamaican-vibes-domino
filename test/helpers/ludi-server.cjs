// Separate process so persistence tests can kill the server without running cleanup.
const express=require('express');
const {createLUDIRouter}=require('../../ludi-online');
let draw=0;
const app=express(),router=createLUDIRouter({storageDir:process.argv[2],rollDie:()=>[6,3][draw++%2]});
app.use('/api/ludi',router);
const server=app.listen(0,'127.0.0.1',()=>process.send({port:server.address().port,restored:router.restoredRooms}));
server.on('close',()=>router.close());
