"use strict";
const Database=require("better-sqlite3");
module.exports=(conf={})=>{
var {path=__dirname+'/db.db'}=conf;
var DB=new Database(path);

// 初始化数据库表结构
function initDatabase() {
    // 创建服务器表
    DB.prepare(`
        CREATE TABLE IF NOT EXISTS servers (
            sid TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            top INTEGER DEFAULT 0,
            status INTEGER DEFAULT 1,
            expire_time INTEGER,
            group_id TEXT DEFAULT 'default'
        )
    `).run();

    // 创建分组表
    DB.prepare(`
        CREATE TABLE IF NOT EXISTS groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            top INTEGER DEFAULT 0
        )
    `).run();

    // 创建流量统计表
    DB.prepare(`
        CREATE TABLE IF NOT EXISTS traffic (
            sid TEXT PRIMARY KEY,
            hs TEXT,
            ds TEXT,
            ms TEXT
        )
    `).run();

    // 创建负载统计表（分钟级）
    DB.prepare(`
        CREATE TABLE IF NOT EXISTS load_m (
            sid TEXT,
            cpu REAL,
            mem REAL,
            swap REAL,
            ibw REAL,
            obw REAL,
            expire_time INTEGER,
            PRIMARY KEY(sid)
        )
    `).run();

    // 创建负载统计表（小时级）
    DB.prepare(`
        CREATE TABLE IF NOT EXISTS load_h (
            sid TEXT,
            cpu REAL,
            mem REAL,
            swap REAL,
            ibw REAL,
            obw REAL,
            expire_time INTEGER,
            PRIMARY KEY(sid)
        )
    `).run();

    // 创建SSH脚本表
    DB.prepare(`
        CREATE TABLE IF NOT EXISTS ssh_scripts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `).run();

    // 创建设置表
    DB.prepare(`
        CREATE TABLE IF NOT EXISTS setting (
            key TEXT PRIMARY KEY,
            val TEXT
        )
    `).run();

    // 检查并创建默认分组
    const defaultGroup = DB.prepare("SELECT * FROM groups WHERE id = 'default'").get();
    if (!defaultGroup) {
        DB.prepare("INSERT INTO groups (id, name, top) VALUES ('default', '默认分组', 0)").run();
    }
}

// 执行初始化
initDatabase();

const {servers}=require("./servers")(DB),
    {traffic,lt}=require("./traffic")(DB),
    {load_m,load_h}=require("./load")(DB),
    {ssh_scripts}=require("./ssh_scripts")(DB),
    {setting}=require("./setting")(DB),
    {groups}=require("./groups")(DB);

function getServers(){return servers.all();}
return {
    DB,
    servers,getServers,
    traffic,lt,
    load_m,load_h,
    ssh_scripts,
    setting,
    groups,
};
}