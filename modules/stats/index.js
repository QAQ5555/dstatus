"use strict";
const fetch=require("node-fetch"),
    schedule=require("node-schedule");
function sleep(ms){return new Promise(resolve=>setTimeout(()=>resolve(),ms));};
module.exports=async(svr)=>{
const {db,pr,bot,setting}=svr.locals;
var stats={},fails={},highcpu={},highDown={},updating=new Set(),noticed={};

/**
 * 统一的状态数据获取接口
 * @param {boolean} isAdmin - 是否为管理员
 * @param {boolean} shouldFilter - 是否需要过滤敏感数据
 * @returns {Object} 处理后的状态数据
 */
function getStatsData(isAdmin = false, shouldFilter = true) {
    try {
        const statsData = getStats(isAdmin);
        
        // 处理每个节点的数据
        Object.entries(statsData).forEach(([sid, node]) => {
            // 非管理员过滤敏感数据
            if (!isAdmin && shouldFilter && node.data) {
                delete node.data;
            }
            
            // 处理stat对象
            if (typeof node.stat === 'number' || !node.stat) {
                // 如果stat是数字或不存在，转换为标准对象结构
                const isOffline = !node.stat || node.stat <= 0;
                statsData[sid] = {
                    ...node,
                    stat: {
                        cpu: { multi: 0 },
                        mem: {
                            virtual: {
                                used: 0,
                                total: 1,
                                usedPercent: 0
                            }
                        },
                        net: {
                            delta: { in: 0, out: 0 },
                            total: { in: 0, out: 0 }
                        },
                        offline: isOffline
                    }
                };
            } else if (typeof node.stat === 'object') {
                // 确保对象结构完整性并处理无效值
                const cpuMulti = Number(node.stat.cpu?.multi) || 0;
                const memUsed = Number(node.stat.mem?.virtual?.used) || 0;
                const memTotal = Number(node.stat.mem?.virtual?.total) || 1;
                const memPercent = Number(node.stat.mem?.virtual?.usedPercent) || (memTotal > 0 ? (memUsed / memTotal * 100) : 0);

                statsData[sid] = {
                    ...node,
                    stat: {
                        ...node.stat,
                        cpu: {
                            multi: cpuMulti >= 0 ? cpuMulti : 0,
                            single: Array.isArray(node.stat.cpu?.single) ? 
                                   node.stat.cpu.single.map(v => Number(v) >= 0 ? Number(v) : 0) : 
                                   [0]
                        },
                        mem: {
                            virtual: {
                                used: memUsed,
                                total: memTotal,
                                usedPercent: memPercent >= 0 ? memPercent : 0
                            }
                        },
                        net: {
                            delta: {
                                in: Math.max(0, Number(node.stat.net?.delta?.in) || 0),
                                out: Math.max(0, Number(node.stat.net?.delta?.out) || 0)
                            },
                            total: {
                                in: Math.max(0, Number(node.stat.net?.total?.in) || 0),
                                out: Math.max(0, Number(node.stat.net?.total?.out) || 0)
                            }
                        }
                    }
                };
            }
        });
        
        // 添加详细的数据日志
        if (setting.debug) {
            const sampleNode = Object.values(statsData)[0];
            console.log(`[${new Date().toISOString()}] 状态数据示例:`, {
                name: sampleNode?.name,
                stat: sampleNode?.stat ? {
                    cpu: sampleNode.stat.cpu?.multi,
                    mem: sampleNode.stat.mem?.virtual?.usedPercent,
                    net_in: sampleNode.stat.net?.delta?.in,
                    net_out: sampleNode.stat.net?.delta?.out
                } : '不存在'
            });
        }
        
        return statsData;
    } catch (error) {
        console.error('获取状态数据失败:', error);
        return {};
    }
}

function getStats(isAdmin=false){
    let Stats = {};
    for(let server of db.servers.all()) {
        if(server.status == 1 || (server.status == 2 && isAdmin)){
            const serverStats = stats[server.sid];
            // 状态判断逻辑：
            // - 如果没有stats记录，返回-1（初始状态）
            // - 如果stats.stat === false，说明连接失败
            // - 如果有具体数据，说明在线
            const stat = !serverStats ? -1 : 
                        serverStats.stat === false ? 0 :
                        serverStats.stat;
            
            Stats[server.sid] = {
                name: server.name,
                stat: stat,
                expire_time: server.expire_time,
                group_id: server.group_id,
                top: server.top,
                traffic_used: serverStats?.traffic_used || 0,
                traffic_limit: server.traffic_limit || 0,
                traffic_reset_day: server.traffic_reset_day || 1,
                traffic_calibration_date: server.traffic_calibration_date || 0,
                traffic_calibration_value: server.traffic_calibration_value || 0,
                calibration_base_traffic: serverStats?.calibration_base_traffic || null,
                data: server.data
            };
        }
    }
    return Stats;
}

// 将getStats和getStatsData方法添加到svr.locals中
svr.locals.stats = { getStats, getStatsData };

// 更新路由处理
svr.get("/",(req,res)=>{
    try {
        const theme = req.query.theme || db.setting.get("theme") || "card";
        const isAdmin = req.admin;
        
        console.log(`[${new Date().toISOString()}] 首页请求 - 主题:${theme} 管理员:${isAdmin}`);
        
        res.render(`stats/${theme}`,{
            stats: getStatsData(isAdmin),
            groups: db.groups.getWithCount(),
            theme,
            admin: isAdmin
        });
    } catch (error) {
        console.error('首页渲染错误:', error);
        res.status(500).send('服务器内部错误');
    }
});

svr.get("/stats/data",(req,res)=>{
    try {
        const isAdmin = req.admin;
        console.log(`[${new Date().toISOString()}] 数据API请求 - 管理员:${isAdmin}`);
        
        res.json(getStatsData(isAdmin));
    } catch (error) {
        console.error('数据API错误:', error);
        res.status(500).json({ error: '获取数据失败' });
    }
});

svr.get("/stats/:sid",(req,res)=>{
    let {sid}=req.params;
    const statsData = getStats(req.admin);
    const node = statsData[sid];
    if (!node) {
        return res.status(404).send('Node not found');
    }
    
    // 获取服务器完整信息
    const server = db.servers.get(sid);
    if (server) {
        // 添加校准数据到node对象
        node.traffic_calibration_date = server.traffic_calibration_date || 0;
        node.traffic_calibration_value = server.traffic_calibration_value || 0;
        node.traffic_limit = server.traffic_limit || 0;
        node.traffic_reset_day = server.traffic_reset_day || 1;
        
        // 预处理数据，确保所有值都有默认值
        node.traffic_used = node.traffic_used || 0;
        node.traffic_limit = node.traffic_limit || 0;
        node.traffic_reset_day = node.traffic_reset_day || 1;
    }
    
    // 添加预处理的JSON数据
    const preProcessedData = {
        traffic_used: node.traffic_used || 0,
        traffic_limit: node.traffic_limit || 0,
        traffic_reset_day: node.traffic_reset_day || 1,
        traffic_calibration_date: node.traffic_calibration_date || 0,
        traffic_calibration_value: node.traffic_calibration_value || 0,
        calibration_base_traffic: node.calibration_base_traffic || null
    };
    
    res.render('stat',{
        sid,
        node,
        preProcessedData: JSON.stringify(preProcessedData),
        traffic: db.traffic.get(sid),
        load_m: db.load_m.select(sid),
        load_h: db.load_h.select(sid),
        admin: req.admin
    });
});
svr.get("/stats/:sid/data",(req,res)=>{
    let {sid}=req.params;
    res.json({sid,...stats[sid]});
});

// 流量统计API
svr.get("/stats/:sid/traffic", async (req, res) => {
    const { sid } = req.params;
    const server = db.servers.get(sid);
    
    if (!server) {
        return res.json({
            error: '服务器不存在',
            data: null
        });
    }
    
    try {
        // 获取traffic表中的ds数据
        const trafficData = await db.traffic.get(sid);
        
        res.json({
            data: {
                ds: trafficData?.ds || [],  // 月度流量记录数据
                calibration_date: server.traffic_calibration_date || 0,
                calibration_value: server.traffic_calibration_value || 0,
                traffic_reset_day: server.traffic_reset_day || 1,
                traffic_limit: server.traffic_limit || 0
            }
        });
    } catch (error) {
        console.error('获取流量统计失败:', error);
        res.status(500).json({
            error: '获取流量统计失败',
            message: error.message
        });
    }
});

svr.post("/stats/update",(req,res)=>{
    let {sid,data}=req.body;
    stats[sid]=data;
    res.json(pr(1,'update success'));
});
async function getStat(server){
    let res;
    try{
        res=await fetch(`http://${server.data.ssh.host}:${server.data.api.port}/stat`,{
            method:"GET",
            headers:{key:server.data.api.key},
            timeout:15000,
        }).then(res=>res.json());
    }catch(e){
        // console.log(e);
        res={success:false,msg:'timeout'};
    }
    if(res.success)return res.data;
    else return false;
}
async function update(server){
    let {sid}=server;
    
    if(server.status<=0){
        delete stats[sid];
        return;
    }
    
    let stat = await getStat(server);
    if(stat){
        let notice = false;
        if(stats[sid] && stats[sid].stat==false) notice=true;
        
        // 1. 确保基础网络数据结构完整
        if (!stat.net || typeof stat.net !== 'object') {
            stat.net = {
                delta: { in: 0, out: 0 },
                total: { in: 0, out: 0 },
                devices: {}
            };
        }

        // 2. 处理网络设备数据
        let deviceData = null;
        if (stat.net.devices && server.data.device) {
            deviceData = stat.net.devices[server.data.device];
            if (deviceData) {
                // 深拷贝设备数据，避免引用问题
                deviceData = {
                    total: {
                        in: Number(deviceData.total?.in || 0),
                        out: Number(deviceData.total?.out || 0)
                    },
                    delta: {
                        in: Number(deviceData.delta?.in || 0),
                        out: Number(deviceData.delta?.out || 0)
                    }
                };
            }
        }

        // 3. 构建标准化的网络数据结构
        const networkData = {
            delta: {
                in: deviceData ? deviceData.delta.in : Number(stat.net.delta?.in || 0),
                out: deviceData ? deviceData.delta.out : Number(stat.net.delta?.out || 0)
            },
            total: {
                in: deviceData ? deviceData.total.in : Number(stat.net.total?.in || 0),
                out: deviceData ? deviceData.total.out : Number(stat.net.total?.out || 0)
            }
        };
        
        // 4. 更新服务器状态
        stats[sid] = {
            name: server.name,
            stat: {
                ...stat,
                net: networkData  // 使用标准化后的网络数据
            },
            expire_time: server.expire_time,
            traffic_used: stats[sid]?.traffic_used || 0,
            traffic_limit: server.traffic_limit || 0,
            traffic_reset_day: server.traffic_reset_day || 1,
            traffic_calibration_date: server.traffic_calibration_date || 0,
            traffic_calibration_value: server.traffic_calibration_value || 0,
            calibration_base_traffic: stats[sid]?.calibration_base_traffic || null
        };
        
        fails[sid]=0;
        if(notice){
            bot.funcs.notice(`#恢复 ${server.name} ${new Date().toLocaleString()}`);
        }
    } else {
        let notice=false;
        if((fails[sid]=(fails[sid]||0)+1)>10){
            if(stats[sid]&&stats[sid].stat)notice=true;
            stats[sid]={
                name:server.name,
                stat:false,
                expire_time:server.expire_time,
                traffic_used: stats[sid]?.traffic_used || 0
            };
        }
        if(notice){
            bot.funcs.notice(`#掉线 ${server.name} ${new Date().toLocaleString()}`);
        }
    }
}
async function get(){
    let s=new Set(),wl=[];
    for(let server of db.servers.all())if(server.status>0){
        s.add(server.sid);
        if(updating.has(server.sid))continue;
        wl.push((async(server)=>{
            updating.add(server.sid);
            await update(server);
            updating.delete(server.sid);
        })(server));
    }
    for(let sid in stats)if(!s.has(sid))delete stats[sid];
    return Promise.all(wl);
}
function calc(){
    for(let server of db.servers.all()){
        let {sid}=server,stat=stats[sid];
        if(!stat||!stat.stat||stat.stat==-1)continue;
        let ni=stat.stat.net.total.in,
            no=stat.stat.net.total.out,
            t=db.lt.get(sid)||db.lt.ins(sid);
        let ti=ni<t.traffic[0]?ni:ni-t.traffic[0],
            to=no<t.traffic[1]?no:no-t.traffic[1];
        db.lt.set(sid,[ni,no]);
        db.traffic.add(sid,[ti,to]);
    }
}
get();
setInterval(get,1500);
// sleep(10000).then(calc);
setInterval(calc,30*1000);

schedule.scheduleJob({second:0},()=>{
    for(let {sid} of db.servers.all()){
        let cpu=-1,mem=-1,swap=-1,ibw=-1,obw=-1;
        let stat=stats[sid];
        if(stat&&stat.stat&&stat.stat!=-1){
            cpu=stat.stat.cpu.multi*100;
            mem=stat.stat.mem.virtual.usedPercent;
            swap=stat.stat.mem.swap.usedPercent;
            ibw=stat.stat.net.delta.in;
            obw=stat.stat.net.delta.out;
        }
        db.load_m.shift(sid,{cpu,mem,swap,ibw,obw});
    }
});
schedule.scheduleJob({minute:0,second:1},()=>{
    db.traffic.shift_hs();
    for(let {sid} of db.servers.all()){
        let Cpu=0,Mem=0,Swap=0,Ibw=0,Obw=0,tot=0;
        for(let {cpu,mem,swap,ibw,obw} of db.load_m.select(sid))if(cpu!=-1){
            ++tot;
            Cpu+=cpu,Mem+=mem,Swap+=swap,Ibw+=ibw,Obw+=obw;
        }
        if(tot==0)db.load_h.shift(sid,{cpu:-1,mem:-1,swap:-1,ibw:-1,obw:-1});
        else db.load_h.shift(sid,{cpu:Cpu/tot,mem:Mem/tot,swap:Swap/tot,ibw:Ibw/tot,obw:Obw/tot});
    }
});
schedule.scheduleJob({hour:4,minute:0,second:2},()=>{db.traffic.shift_ds();});
schedule.scheduleJob({date:1,hour:4,minute:0,second:3},()=>{db.traffic.shift_ms();});

// 获取校准日期后的流量数据
async function getTrafficAfterCalibration(sid, calibrationDate) {
    try {
        // 获取traffic表中的ds数据
        const trafficData = await db.traffic.get(sid);
        if (!trafficData || !trafficData.ds) {
            return 0;
        }

        // 计算校准日期后的总流量
        let totalTraffic = 0;
        for (const record of trafficData.ds) {
            if (record.timestamp > calibrationDate) {
                // ds中的数据是[入站, 出站]格式
                totalTraffic += (record[0] + record[1]);
            }
        }
        return totalTraffic;
    } catch (error) {
        console.error('获取流量数据失败:', error);
        return 0;
    }
}

// 每小时更新一次流量统计
schedule.scheduleJob('0 * * * *', async () => {
    console.log('Updating traffic stats...');
    for(let server of db.servers.all()) {
        if(server.status <= 0) continue;
        
        // 更新流量统计
        const currentStats = stats[server.sid] || {};
        stats[server.sid] = {
            ...currentStats,
            traffic_used: currentStats.traffic_used || 0,
            traffic_limit: server.traffic_limit || 0
        };
    }
});
}
