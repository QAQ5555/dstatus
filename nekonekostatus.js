#!/usr/bin/env node
"use strict"
const express=require('express'),
    bp=require('body-parser'),
    ckp=require("cookie-parser"),
    nunjucks=require("nunjucks"),
    fs=require("fs"),
    fileUpload=require('express-fileupload'),
    schedule=require("node-schedule");
const core=require("./core"),
    db=require("./database/index")(),
    {pr,md5,uuid}=core;
var setting=db.setting.all();
var svr=express();

svr.use(bp.urlencoded({extended: false}));
svr.use(bp.json({limit:'100mb'}));
svr.use(ckp());
svr.use(express.json());
svr.use(express.static(__dirname+"/static"));
// 添加文件上传中间件
svr.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB限制
    abortOnLimit: true
}));

svr.engine('html', nunjucks.render);
svr.set('view engine', 'html');
require('express-ws')(svr);

var env=nunjucks.configure(__dirname+'/views', {
    autoescape: true,
    express: svr,
    watch:setting.debug,
});

// 添加自定义过滤器
env.addFilter('formatDate', function(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toISOString().split('T')[0];
});

env.addFilter('bytesToGB', function(bytes) {
    if (!bytes) return '0';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2);
});

env.addFilter('formatTimestamp', function(timestamp) {
    if (!timestamp) return '未校准';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
});

// 添加格式化百分比的过滤器
env.addFilter('formatPercentage', function(used, limit) {
    if (!limit || limit <= 0) return '0%';
    return ((used / limit * 100) || 0).toFixed(1) + '%';
});

var admin_tokens=new Set();
try{for(var token of require("./tokens.json"))admin_tokens.add(token);}catch{}
setInterval(()=>{
    var tokens=[];
    for(var token of admin_tokens.keys())tokens.push(token);
    fs.writeFileSync(__dirname+"/tokens.json",JSON.stringify(tokens));
},1000);
svr.all('*',(req,res,nxt)=>{
    if(admin_tokens.has(req.cookies.token))req.admin=true;
    nxt();
});
svr.get('/login',(req,res)=>{
    if(req.admin)res.redirect('/');
    else res.render('login',{});
});
svr.post('/login',(req,res)=>{
    var {password}=req.body;
    if(password==md5(db.setting.get("password"))){
        var token=uuid.v4();
        admin_tokens.add(token);
        res.cookie("token",token);
        res.json(pr(1,token));
    }
    else res.json(pr(0,"密码错误"));
});
svr.get('/logout',(req,res)=>{
    admin_tokens.delete(req.cookies.token);
    res.clearCookie("token");
    res.redirect("/login");
});
svr.all('/admin*',(req,res,nxt)=>{
    if(req.admin)nxt();
    else res.redirect('/login');
});

// 设置全局变量
svr.locals={
    setting,
    db,
    bot,
    ...core,
};

// 加载admin模块
require('./modules/admin')(svr);
require('./modules/restart')(svr);  // 加载重启模块

var bot=null;
if(setting.bot&&setting.bot.token){
    bot=require("./bot")(setting.bot.token,setting.bot.chatIds);
    if(setting.bot.webhook){
        bot.bot.setWebHook(setting.site.url+"/bot"+setting.bot.token).then(()=>{
            bot.bot.setMyCommands(bot.cmds);
        });
        svr.all('/bot'+setting.bot.token, (req,res)=>{
            bot.bot.processUpdate(req.body);
            res.sendStatus(200);
        });
    }
    else bot.bot.startPolling();
}

fs.readdirSync(__dirname+'/modules',{withFileTypes:1}).forEach(file=>{
    if(!file.isDirectory())return;
    try{require(`./modules/${file.name}/index.js`)(svr);}catch(e){console.log(e)}
});
const port=process.env.PORT||db.setting.get("listen"),host=process.env.HOST||'';
svr.server=svr.listen(port,host,()=>{console.log(`server running @ http://${host ? host : 'localhost'}:${port}`);})