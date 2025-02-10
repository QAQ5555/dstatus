/**
 * @file stats.js
 * @description 服务器状态监控前端脚本，负责实时更新服务器状态信息和拖拽排序功能
 */

// WebSocket连接管理
    let ws = null;
    let reconnectTimer = null;
let currentGroupId = 'all';  // 跟踪当前分组

    function initWebSocket() {
        if (ws) {
            ws.close();
            ws = null;
        }

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}/ws/stats`;

        console.debug('正在连接WebSocket:', wsUrl);
        ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
        try {
            // 1. 数据完整性检查
            if (!event.data) {
                console.warn('接收到空数据');
                return;
            }

            // 2. 解析数据
            const message = JSON.parse(event.data);
            
            // 3. 验证消息格式
            if (!message || typeof message !== 'object') {
                console.warn('无效的消息格式:', message);
                return;
            }

            const {type, data, timestamp} = message;
            
            // 4. 处理stats类型消息
            if (type === 'stats') {
                // 4.1 验证数据结构
                if (!data || typeof data !== 'object') {
                    console.warn('节点统计数据为空或格式错误:', data);
                    return;
                }

                // 4.2 检查是否有节点数据
                const nodeCount = Object.keys(data).length;
                if (nodeCount === 0) {
                    console.warn('没有节点数据');
                    return;
                }

                // 4.3 初始化总计数据
                const totals = {
                    nodes: nodeCount,
                    online: 0,
                    offline: 0,
                    download: 0,
                    upload: 0,
                    downloadTotal: 0,
                    uploadTotal: 0,
                    groups: {}
                };

                // 4.4 处理每个节点的数据
                Object.entries(data).forEach(([sid, node]) => {
                    // 检查节点状态
                    const isOnline = node.stat && typeof node.stat === 'object' && !node.stat.offline;
                    
                    // 更新节点计数
                    if (isOnline) {
                        totals.online++;
                        
                        // 确保网络数据存在且有效
                        if (node.stat.net) {
                            // 转换为数字并确保非负
                            const deltaIn = Math.max(0, Number(node.stat.net.delta?.in || 0));
                            const deltaOut = Math.max(0, Number(node.stat.net.delta?.out || 0));
                            const totalIn = Math.max(0, Number(node.stat.net.total?.in || 0));
                            const totalOut = Math.max(0, Number(node.stat.net.total?.out || 0));
                            
                            // 累加到总计
                            totals.download += deltaIn;
                            totals.upload += deltaOut;
                            totals.downloadTotal += totalIn;
                            totals.uploadTotal += totalOut;
                            
                            if (window.setting?.debug) {
                                console.debug(`节点 ${node.name} 带宽:`, {
                                    deltaIn,
                                    deltaOut,
                                    totalIn,
                                    totalOut
                                });
                            }
                        }
                    } else {
                        totals.offline++;
                    }

                    // 更新分组统计
                    const groupId = node.group_id || 'ungrouped';
                    if (!totals.groups[groupId]) {
                        totals.groups[groupId] = { total: 0, online: 0 };
                    }
                    totals.groups[groupId].total++;
                    if (isOnline) totals.groups[groupId].online++;
                });

                if (window.setting?.debug) {
                    console.debug('总计数据:', {
                        nodes: totals.nodes,
                        online: totals.online,
                        offline: totals.offline,
                        download: strbps(totals.download * 8),
                        upload: strbps(totals.upload * 8),
                        downloadTotal: strB(totals.downloadTotal),
                        uploadTotal: strB(totals.uploadTotal)
                    });
                }

                // 4.5 更新总体统计显示
                updateTotalStats({
                    ...totals,
                    nodes: data,  // 保持原始节点数据
                    rawData: data // 添加原始数据用于地区统计
                });

                // 4.6 更新节点显示
                Object.entries(data).forEach(([sid, node]) => {
                    updateNodeDisplay(sid, {
                        ...node,
                        expire_time: node.expire_time // 确保到期时间数据传递
                    });
                });

                // 4.7 如果启用了实时排序，重新应用排序
                const realtimeSortCheckbox = document.getElementById('realtime-sort');
                if (realtimeSortCheckbox?.checked && window.currentSortConfig) {
                    applySort(window.currentSortConfig.type, window.currentSortConfig.direction);
                }

                // 在数据更新完成后触发同步事件（新增）
                setTimeout(() => {
                    const syncEvent = new CustomEvent('statsSyncComplete', {
                        detail: { 
                            timestamp: Date.now(),
                            nodeCount: Object.keys(data).length 
                        }
                    });
                    document.dispatchEvent(syncEvent);
                }, 50);
            } else {
                console.warn('未知的消息类型:', type);
            }
        } catch (error) {
            console.error('WebSocket数据处理错误:', error);
            console.error('原始数据:', event.data);
        }
    };

    ws.onopen = () => {
        console.debug('WebSocket已连接');
        // 清除重连定时器
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };

    ws.onclose = (event) => {
        console.warn('WebSocket连接已关闭:', event.code, event.reason);
        ws = null;

        // 设置重连
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
            console.debug('尝试重新连接WebSocket...');
            initWebSocket();
        }, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
    };
}

// 页面加载时初始化WebSocket
document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }
});

const KB = 1024, MB = KB * 1024, GB = MB * 1024, TB = GB * 1024;
function strB(bytes) {
    if (isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

const Kbps = 1000, Mbps = Kbps * 1000, Gbps = Mbps * 1000, Tbps = Gbps * 1000;
function strbps(bps) {
    if (isNaN(bps) || bps === 0) return '0 bps';
    const k = 1024;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
    const i = Math.floor(Math.log(bps) / Math.log(k));
    return (bps / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

/**
 * 计算并格式化剩余天数
 * @param {number} expireTimestamp - 到期时间戳（秒）
 * @returns {string} 格式化后的剩余天数字符串
 */
function formatRemainingDays(expireTimestamp) {
    if (!expireTimestamp) return '永久';
    
    const now = Math.floor(Date.now() / 1000);
    const remainingSeconds = expireTimestamp - now;
    const remainingDays = Math.ceil(remainingSeconds / (24 * 60 * 60));
    
    if (remainingDays < 0) {
        return '已过期';
    } else if (remainingDays === 0) {
        return '今日到期';
    }
    return ` ${remainingDays} 天`;
}

// 使用原生 JavaScript 获取元素
function E(id) {
    return document.getElementById(id);
}

// 更新提示信息
function updateTooltip(element, content) {
    if (element) {
        element.setAttribute('data-tooltip', content);
    }
}

// 节点状态常量
const NodeStatus = {
    ONLINE: 'online',
    OFFLINE: 'offline',
    HIDDEN: 'hidden'
};

// 默认排序配置
const SortConfig = {
    defaultDirection: 'desc',      // 默认降序
    directions: {
        default: 'desc',           // 新增:默认排序(按top值)
        cpu: 'desc',
        memory: 'desc',
        total_traffic: 'desc',
        upload: 'desc',
        download: 'desc',
        expiration: 'asc'  // 只有到期时间默认升序（剩余时间少的优先）
    }
};

// 节点样式配置
const NodeStyleConfig = {
    [NodeStatus.ONLINE]: {
        indicator: 'bg-green-500',
        card: 'opacity-100',
        text: 'text-gray-200',
        title: '在线'
    },
    [NodeStatus.OFFLINE]: {
        indicator: 'bg-red-500',
        card: 'opacity-60',
        text: 'text-gray-400',
        title: '离线'
    },
    [NodeStatus.HIDDEN]: {
        indicator: 'bg-gray-500',
        card: 'hidden',
        text: 'text-gray-400',
        title: '隐藏'
    }
};

// 判断节点状态的工具函数
function getNodeStatus(node) {
    // 隐藏状态优先判断
    if (node.status === 2) return NodeStatus.HIDDEN;
    
    // 检查离线状态
    if (node?.stat?.offline) return NodeStatus.OFFLINE;
    
    // 最后检查stat对象是否存在
    const isValidStat = node?.stat && typeof node.stat === 'object';
    const status = isValidStat ? NodeStatus.ONLINE : NodeStatus.OFFLINE;
    
    return status;
}

// 设置存储相关常量和函数
const SETTINGS_KEY = 'node_display_settings';

// 敏感信息配置
const SENSITIVE_CONFIG = {
  serverName: {
    selector: '.server-name a',
    mask: name => name.replace(/[^-_\s]/g, '*')
  },
  infoButton: {
    selector: '[id$="_host"]',
    hide: true
  }
};

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {
      hideSensitive: false,
      hideOffline: false
    };
  } catch {
    return {
      hideSensitive: false,
      hideOffline: false
    };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// 处理敏感信息
function handleSensitiveInfo(card, shouldHide) {
  if (shouldHide) {
    // 处理服务器名称
    const nameEl = card.querySelector(SENSITIVE_CONFIG.serverName.selector);
    if (nameEl) {
      nameEl.dataset.originalText = nameEl.textContent;
      nameEl.textContent = SENSITIVE_CONFIG.serverName.mask(nameEl.textContent);
    }
    
    // 隐藏信息按钮
    const infoBtn = card.querySelector(SENSITIVE_CONFIG.infoButton.selector);
    if (infoBtn) {
      infoBtn.style.display = 'none';
    }
  } else {
    // 恢复服务器名称
    const nameEl = card.querySelector(SENSITIVE_CONFIG.serverName.selector);
    if (nameEl && nameEl.dataset.originalText) {
      nameEl.textContent = nameEl.dataset.originalText;
    }
    
    // 显示信息按钮
    const infoBtn = card.querySelector(SENSITIVE_CONFIG.infoButton.selector);
    if (infoBtn) {
      infoBtn.style.display = '';
    }
  }
}

/**
 * 更新节点统计信息
 * @param {Object} stats - 节点统计数据
 */
function updateNodeStats(stats) {
    if (!stats || typeof stats !== 'object') {
        console.error('无效的统计数据:', stats);
        return;
    }

    try {
        // 1. 更新所有节点的显示
        Object.entries(stats).forEach(([sid, node]) => {
            // 获取节点状态和对应的样式配置
            const status = getNodeStatus(node);
            const styleConfig = NodeStyleConfig[status];
            
            // 更新所有分组中的节点
            const cards = document.querySelectorAll(`.server-card[data-sid="${sid}"]`);
            cards.forEach(card => {
                // 移除所有可能的状态类
                Object.values(NodeStyleConfig).forEach(config => {
                    card.classList.remove(config.card);
                    card.classList.remove(config.text);
                });
                
                // 添加当前状态对应的类
                if (styleConfig.card !== 'hidden') {
                    card.classList.add(styleConfig.card);
                }
                card.style.display = styleConfig.card === 'hidden' ? 'none' : '';
                
                // 更新文本样式
                const textElements = card.querySelectorAll('.text-gray-200, .text-gray-400');
                textElements.forEach(el => {
                    el.classList.remove('text-gray-200', 'text-gray-400');
                    el.classList.add(styleConfig.text);
                });
                
            updateNodeDisplay(sid, node);
            });
        });

        // 2. 处理离线节点
        document.querySelectorAll('.server-card').forEach(card => {
            const sid = card.dataset.sid;
            if (!stats[sid]) {
                resetOfflineNodeDisplay(sid);
            }
        });

        // 3. 如果启用了实时排序，重新应用排序
        const realtimeSortCheckbox = document.getElementById('realtime-sort');
        if (realtimeSortCheckbox?.checked && window.currentSortConfig) {
            applySort(window.currentSortConfig.type, window.currentSortConfig.direction);
        }

    } catch (error) {
        console.error('更新节点统计信息时出错:', error);
    }
}

/**
 * 更新节点显示
 * @param {string} sid - 节点ID
 * @param {Object} node - 节点数据
 */
function updateNodeDisplay(sid, node) {
    const cards = document.querySelectorAll(`[data-sid="${sid}"]`);
    if (!cards.length) return;

    cards.forEach(card => {
        // 更新数据属性
        if (node.stat) {
            // CPU数据
            if (node.stat.cpu) {
                const cpuValue = (node.stat.cpu.multi * 100).toFixed(2);
                // 更新根元素数据属性
                card.dataset.cpu = cpuValue;
                
                // 更新CPU显示和进度条
                const cpuElements = card.querySelectorAll(`[id$="_CPU"]`);
                cpuElements.forEach(el => {
                    el.textContent = `${cpuValue}%`;
                    el.dataset.cpu = cpuValue;
                });
                
                const cpuProgress = card.querySelector(`[id$="_CPU_progress"]`);
                if (cpuProgress) {
                    cpuProgress.style.width = `${Math.min(100, Math.max(0, cpuValue))}%`;
                }
            }

            // 内存数据
            if (node.stat.mem && node.stat.mem.virtual) {
                const memValue = ((node.stat.mem.virtual.used / node.stat.mem.virtual.total) * 100).toFixed(2);
                // 更新根元素数据属性
                card.dataset.memory = memValue;
                
                // 更新内存显示和进度条
                const memElements = card.querySelectorAll(`[id$="_MEM"]`);
                memElements.forEach(el => {
                    el.textContent = `${memValue}%`;
                    el.dataset.memory = memValue;
                });
                
                const memProgress = card.querySelector(`[id$="_MEM_progress"]`);
                if (memProgress) {
                    memProgress.style.width = `${Math.min(100, Math.max(0, memValue))}%`;
                }
            }

            // 网络数据
            if (node.stat.net) {
                // 实时带宽
                if (node.stat.net.delta) {
                    // 更新根元素数据属性
                    card.dataset.download = node.stat.net.delta.in;
                    card.dataset.upload = node.stat.net.delta.out;
                    
                    // 更新下载速度显示
                    const netInElements = card.querySelectorAll(`[id$="_NET_IN"]`);
                    netInElements.forEach(el => {
                        el.textContent = strbps(node.stat.net.delta.in * 8);
                        el.dataset.download = node.stat.net.delta.in;
                    });
                    
                    // 更新上传速度显示
                    const netOutElements = card.querySelectorAll(`[id$="_NET_OUT"]`);
                    netOutElements.forEach(el => {
                        el.textContent = strbps(node.stat.net.delta.out * 8);
                        el.dataset.upload = node.stat.net.delta.out;
                    });
                }

                // 总流量
                if (node.stat.net.total) {
                    // 更新根元素数据属性
                    card.dataset.totalDownload = node.stat.net.total.in;
                    card.dataset.totalUpload = node.stat.net.total.out;
                    
                    // 更新总下载量显示
                    const netInTotalElements = card.querySelectorAll(`[id$="_NET_IN_TOTAL"]`);
                    netInTotalElements.forEach(el => {
                        el.textContent = strB(node.stat.net.total.in);
                        el.dataset.totalDownload = node.stat.net.total.in;
                    });
                    
                    // 更新总上传量显示
                    const netOutTotalElements = card.querySelectorAll(`[id$="_NET_OUT_TOTAL"]`);
                    netOutTotalElements.forEach(el => {
                        el.textContent = strB(node.stat.net.total.out);
                        el.dataset.totalUpload = node.stat.net.total.out;
                    });
                }
            }
        }

        // 更新状态指示器
        const status = getNodeStatus(node);
        card.dataset.status = status; // 添加状态到根元素
        
        const indicators = card.querySelectorAll('[id$="_status_indicator"]');
        indicators.forEach(indicator => {
            // 移除所有可能的状态类
            indicator.classList.remove('bg-green-500', 'bg-red-500');
            // 添加当前状态类
            indicator.classList.add(status === NodeStatus.ONLINE ? 'bg-green-500' : 'bg-red-500');
            // 保持其他基础类
            indicator.classList.add('rounded-full');
            // 根据设备类型添加不同的尺寸类
            if (window.innerWidth < 640) { // 移动端
                indicator.classList.add('w-1.5', 'h-1.5');
            } else { // PC端
                indicator.classList.add('w-2', 'h-2');
            }
        });

        // 更新到期时间
        if (node.expire_time !== undefined) {
            card.dataset.expiration = node.expire_time;
            const expireElements = card.querySelectorAll(`[id$="_EXPIRE_TIME"]`);
            expireElements.forEach(el => {
                el.textContent = formatRemainingDays(node.expire_time);
                el.dataset.expiration = node.expire_time;
            });
        }

        // 更新卡片透明度
        if (status === NodeStatus.ONLINE) {
            card.classList.remove('opacity-60');
            card.classList.add('opacity-100');
        } else {
            card.classList.remove('opacity-100');
            card.classList.add('opacity-60');
        }
    });
}

// 辅助函数: 验证网络数据结构
function validateNetworkStats(netStats) {
    const defaultStats = {
        delta: { in: 0, out: 0 },
        total: { in: 0, out: 0 }
    };

    if (!netStats) {
        console.warn('网络数据为空,使用默认值');
        return defaultStats;
    }

    return {
        delta: {
            in: Number(netStats.delta?.in || 0),
            out: Number(netStats.delta?.out || 0)
        },
        total: {
            in: Number(netStats.total?.in || 0),
            out: Number(netStats.total?.out || 0)
        }
    };
}

// 辅助函数: 更新节点网络显示
function updateNodeNetworkDisplay(sid, netStats) {
    const elements = {
        netIn: document.getElementById(`${sid}_NET_IN`),
        netOut: document.getElementById(`${sid}_NET_OUT`),
        netInTotal: document.getElementById(`${sid}_NET_IN_TOTAL`),
        netOutTotal: document.getElementById(`${sid}_NET_OUT_TOTAL`)
    };

    if (elements.netIn) {
        elements.netIn.textContent = strbps(netStats.delta.in * 8);
    }
    if (elements.netOut) {
        elements.netOut.textContent = strbps(netStats.delta.out * 8);
    }
    if (elements.netInTotal) {
        elements.netInTotal.textContent = strB(netStats.total.in);
    }
    if (elements.netOutTotal) {
        elements.netOutTotal.textContent = strB(netStats.total.out);
    }
}

// 辅助函数: 重置离线节点显示
function resetOfflineNodeDisplay(sid) {
    ['NET_IN', 'NET_OUT', 'NET_IN_TOTAL', 'NET_OUT_TOTAL'].forEach(type => {
        const el = document.getElementById(`${sid}_${type}`);
        if (el) {
            el.textContent = type.includes('TOTAL') ? '0 B' : '0 bps';
        }
    });
}

// 辅助函数: 更新卡片状态
function updateCardStatus(card, status) {
    const config = NodeStyleConfig[status];
    
    // 更新状态指示器
    const indicator = card.querySelector('[id$="_status_indicator"]');
    if (indicator) {
        // 保持基础样式类，只更新颜色类
        const baseClasses = 'w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full';
        const colorClasses = Object.values(NodeStyleConfig).map(cfg => cfg.indicator);
        
        // 移除所有颜色类
        colorClasses.forEach(cls => indicator.classList.remove(cls));
        
        // 设置新的类
        indicator.className = `${baseClasses} ${config.indicator}`;
        indicator.setAttribute('title', config.title);
    }

    // 更新卡片样式
    Object.values(NodeStyleConfig).forEach(cfg => {
        card.classList.remove(cfg.card);
    });
    card.classList.add(config.card);
}

// 辅助函数: 更新进度条
function updateProgressBars(sid, stat) {
    // CPU进度条
    const cpuProgress = document.getElementById(`${sid}_CPU_progress`);
    const cpuValue = stat?.cpu?.multi * 100 || 0;
    if (cpuProgress) {
        cpuProgress.style.width = `${cpuValue}%`;
    }

    // 内存进度条
    const memProgress = document.getElementById(`${sid}_MEM_progress`);
    const memValue = stat?.mem?.virtual?.usedPercent || 0;
    if (memProgress) {
        memProgress.style.width = `${memValue}%`;
    }
}

// 辅助函数: 更新总体统计
function updateTotalStats(totals) {
    try {
        // 1. 数据验证
        if (!totals || typeof totals !== 'object') {
            console.warn('无效的统计数据:', totals);
            return;
        }

        // 2. 确保所有数值有效
        const stats = {
            // 兼容两种格式：直接数字或对象格式
            nodes: typeof totals.nodes === 'object' ? 
                  Object.keys(totals.nodes || {}).length : 
                  Math.max(0, Number(totals.nodes) || 0),
            online: Math.max(0, Number(totals.online) || 0),
            offline: Math.max(0, Number(totals.offline) || 0),
            download: Math.max(0, Number(totals.download) || 0),
            upload: Math.max(0, Number(totals.upload) || 0),
            downloadTotal: Math.max(0, Number(totals.downloadTotal) || 0),
            uploadTotal: Math.max(0, Number(totals.uploadTotal) || 0)
        };

        // 添加调试日志
        console.debug('节点统计:', {
            总节点数: stats.nodes,
            在线节点: stats.online,
            离线节点: stats.offline
        });

        // 3. 更新桌面端显示
        const elements = {
            totalNodes: document.getElementById('total-nodes'),
            onlineNodes: document.getElementById('online-nodes'),
            offlineNodes: document.getElementById('offline-nodes'),
            currentNetIn: document.getElementById('current-download-speed'),
            currentNetOut: document.getElementById('current-upload-speed'),
            totalNetIn: document.getElementById('total-download'),
            totalNetOut: document.getElementById('total-upload'),
            expiringNodes: document.getElementById('expiring-nodes'),
            regionStats: document.getElementById('region-stats')
        };

        // 4. 更新移动端显示
        const mobileElements = {
            totalNodes: document.getElementById('total-nodes-mobile'),
            onlineNodes: document.getElementById('online-nodes-mobile'),
            offlineNodes: document.getElementById('offline-nodes-mobile'),
            currentNetIn: document.getElementById('current-download-speed-mobile'),
            currentNetOut: document.getElementById('current-upload-speed-mobile'),
            totalNetIn: document.getElementById('total-download-mobile'),
            totalNetOut: document.getElementById('total-upload-mobile'),
            regionStats: document.getElementById('region-stats-mobile')
        };

        // 5. 更新基础统计 - 添加空值检查和调试日志
        [elements, mobileElements].forEach(els => {
            if (els.totalNodes) {
                els.totalNodes.textContent = stats.nodes;
                console.debug('更新节点总数:', {
                    元素ID: els.totalNodes.id,
                    更新值: stats.nodes
                });
            } else {
                console.warn('未找到节点总数显示元素');
            }
            if (els.onlineNodes) els.onlineNodes.textContent = stats.online;
            if (els.offlineNodes) els.offlineNodes.textContent = stats.offline;
            if (els.currentNetIn) els.currentNetIn.textContent = strbps(stats.download * 8);
            if (els.currentNetOut) els.currentNetOut.textContent = strbps(stats.upload * 8);
            if (els.totalNetIn) els.totalNetIn.textContent = strB(stats.downloadTotal);
            if (els.totalNetOut) els.totalNetOut.textContent = strB(stats.uploadTotal);
        });

        // 6. 计算即将到期的节点和地区分布
        const now = Math.floor(Date.now() / 1000);
        const sevenDaysFromNow = now + (7 * 24 * 60 * 60);
        let expiringCount = 0;
        const regionStats = new Map();
        
        // 7. 处理每个节点
        Object.entries(totals.nodes || {}).forEach(([sid, node]) => {
            // 跳过非节点数据
            if (!node || typeof node !== 'object' || !node.name) return;
            
            // 检查到期时间
            if (node.expire_time && node.expire_time > now && node.expire_time <= sevenDaysFromNow) {
                expiringCount++;
            }
            
            // 统计地区分布(仅统计在线节点)
            const isOnline = node.stat && typeof node.stat === 'object' && !node.stat.offline;
            if (isOnline && node.data?.location?.country) {
                const country = node.data.location.country;
                const key = country.code;
                if (!regionStats.has(key)) {
                    regionStats.set(key, {
                        code: key,
                        name: country.name_zh || country.name,
                        flag: country.flag || '🏳️',
                        count: 0
                    });
                }
                regionStats.get(key).count++;
            }
        });

        // 8. 获取前9个地区
        const topRegions = Array.from(regionStats.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 9);

        // 9. 更新地区统计
        if (elements.regionStats) {
            elements.regionStats.innerHTML = topRegions.map(region => `
                
                <div class="w-[65px] flex items-center justify-between bg-slate-800 rounded-full px-2 py-1">
                    <div class="flex items-center min-w-0">
                        <span class="text-sm mr-1">${region.flag}</span>
                        <span class="text-xs font-medium">${region.code}</span>
                        <span class="text-xs font-bold ml-1">${region.count}</span>
                    </div>
                </div>
            `).join('');
        }
        if (mobileElements.regionStats) {
            mobileElements.regionStats.innerHTML = topRegions.map(region => `
                <div class="flex items-center justify-between bg-white/5 rounded px-0.5 py-0.5">
                    <div class="flex items-center gap-0.5 min-w-0">
                        <span class="text-xs">${region.flag}</span>
                        <span class="text-[10px] text-gray-200">${region.code}</span>
                    </div>
                    <span class="text-[10px] font-medium text-gray-200">${region.count}</span>
                </div>
            `).join('');
        }

        // 10. 更新分组统计和到期时间显示
        if (totals.groups) {
            Object.entries(totals.groups).forEach(([groupId, groupStats]) => {
                const countElement = document.getElementById(`group-${groupId}-count-tab`);
                if (countElement) {
                    countElement.textContent = `${groupStats.online}/${groupStats.total}`;
                }
            });
        }

        // 更新到期时间显示
        if (elements.expiringNodes) {
            elements.expiringNodes.textContent = expiringCount;
        }

        // 11. 调试日志
        if (window.setting?.debug) {
            console.debug('更新总体统计:', {
                nodes: stats.nodes,
                online: stats.online,
                offline: stats.offline,
                expiringCount,
                topRegions,
                currentDownload: strbps(stats.download * 8),
                currentUpload: strbps(stats.upload * 8),
                totalDownload: strB(stats.downloadTotal),
                totalUpload: strB(stats.uploadTotal)
            });
        }
    } catch (error) {
        console.error('更新总体统计时出错:', error);
    }
}

// 辅助函数: 标记节点错误状态
function markNodeAsError(card) {
    card.classList.add('error-state');
    const statusIndicator = card.querySelector('[id$="_status_indicator"]');
    if (statusIndicator) {
        statusIndicator.classList.add('bg-yellow-500');
        statusIndicator.title = '数据更新失败';
    }
}

// 增加初始化状态标记（新增）
let initializationCompleted = false;

const StatsController = {
    // 防抖计时器
    updateTimer: null,
    
    // 最后一次更新时间
    lastUpdateTime: 0,
    
    // 最小更新间隔（毫秒）
    MIN_UPDATE_INTERVAL: 1000,
    
    // 统一的更新函数
    async update() {
        try {
            // 在首次更新完成时标记（新增）
            if (!initializationCompleted) {
                await this.performInitialUpdate();
                initializationCompleted = true;
            }
            // WebSocket会自动更新数据，这里不需要额外的HTTP请求
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.warn('WebSocket未连接，尝试重新连接...');
                initWebSocket();
            }
        } catch (error) {
            console.error('更新失败:', error);
            this.scheduleRetry();
        }
    },
    
    performInitialUpdate() {
        return new Promise(resolve => {
            const listener = () => {
                document.removeEventListener('statsSyncComplete', listener);
                resolve();
            };
            document.addEventListener('statsSyncComplete', listener);
        });
    },
    
    // 更新节点状态
    updateNodesStatus(stats) {
        const settings = loadSettings();
        let updated = false;
        let totalNetStats = {
            downloadSpeed: 0,
            uploadSpeed: 0,
            totalDownload: 0,
            totalUpload: 0
        };
        
        for (const [sid, node] of Object.entries(stats)) {
            const status = getNodeStatus(node);
            const styleConfig = NodeStyleConfig[status];
            const isOnline = status === NodeStatus.ONLINE;
            
            // 更新所有匹配的服务器卡片
            const serverCards = document.querySelectorAll(`[data-sid="${sid}"]`);
            serverCards.forEach(serverCard => {
                // 应用敏感信息设置
                handleSensitiveInfo(serverCard, settings.hideSensitive);
                
                // 应用离线节点隐藏设置
                if (settings.hideOffline && status === NodeStatus.OFFLINE) {
                    serverCard.style.display = 'none';
                } else {
                // 更新卡片样式
                Object.values(NodeStyleConfig).forEach(config => {
                    serverCard.classList.remove(config.card);
                    serverCard.classList.remove(config.text);
                });
                if (styleConfig.card !== 'hidden') {
                    serverCard.classList.add(styleConfig.card);
                }
                serverCard.style.display = styleConfig.card === 'hidden' ? 'none' : '';
                }
                
                // 更新文本元素
                const textElements = serverCard.querySelectorAll('.text-gray-200, .text-gray-400');
                textElements.forEach(el => {
                    el.classList.remove('text-gray-200', 'text-gray-400');
                    el.classList.add(styleConfig.text);
                });
                
                // 更新节点数据
                this.updateCardData(serverCard, node, status);
                    updated = true;
            });

            // 更新网络统计（只统计在线节点）
            if (isOnline && node.stat?.net) {
                totalNetStats.downloadSpeed += node.stat.net.delta?.in || 0;
                totalNetStats.uploadSpeed += node.stat.net.delta?.out || 0;
                totalNetStats.totalDownload += node.stat.net.total?.in || 0;
                totalNetStats.totalUpload += node.stat.net.total?.out || 0;
            }
        }
        
        // 更新仪表盘网络数据
        this.updateDashboardNetwork(totalNetStats);
    },
    
    // 更新仪表盘网络数据
    updateDashboardNetwork(netStats) {
        // 更新实时带宽 - 桌面端
        const currentDownloadSpeed = document.getElementById('current-download-speed');
        const currentUploadSpeed = document.getElementById('current-upload-speed');
        if (currentDownloadSpeed) {
            currentDownloadSpeed.textContent = strbps(netStats.downloadSpeed * 8);
        }
        if (currentUploadSpeed) {
            currentUploadSpeed.textContent = strbps(netStats.uploadSpeed * 8);
                }

        // 更新实时带宽 - 移动端
        const currentDownloadSpeedMobile = document.getElementById('current-download-speed-mobile');
        const currentUploadSpeedMobile = document.getElementById('current-upload-speed-mobile');
        if (currentDownloadSpeedMobile) {
            currentDownloadSpeedMobile.textContent = strbps(netStats.downloadSpeed * 8);
        }
        if (currentUploadSpeedMobile) {
            currentUploadSpeedMobile.textContent = strbps(netStats.uploadSpeed * 8);
        }

        // 更新总流量 - 桌面端
        const totalDownload = document.getElementById('total-download');
        const totalUpload = document.getElementById('total-upload');
        if (totalDownload) {
            totalDownload.textContent = strB(netStats.totalDownload);
        }
        if (totalUpload) {
            totalUpload.textContent = strB(netStats.totalUpload);
        }

        // 更新总流量 - 移动端
        const totalDownloadMobile = document.getElementById('total-download-mobile');
        const totalUploadMobile = document.getElementById('total-upload-mobile');
        if (totalDownloadMobile) {
            totalDownloadMobile.textContent = strB(netStats.totalDownload);
        }
        if (totalUploadMobile) {
            totalUploadMobile.textContent = strB(netStats.totalUpload);
        }
    },
    
    // 更新单个卡片的数据
    updateCardData(card, node, status) {
        if (!card || !node) {
            console.warn('无效的卡片或节点数据');
            return;
        }

        const sid = card.dataset.sid;
        if (!sid) {
            console.warn('卡片缺少sid属性');
            return;
        }

        console.debug(`更新卡片 ${sid}:`, {
            name: node.name,
            status,
            hasStats: node.stat ? 'yes' : 'no'
        });

        // 更新状态指示器
        const style = NodeStyleConfig[status];
        const indicator = card.querySelector('.status-indicator');
        if (indicator) {
            // 移除所有可能的状态类
            Object.values(NodeStyleConfig).forEach(s => {
                indicator.classList.remove(s.indicator);
            });
            indicator.classList.add(style.indicator);
            indicator.setAttribute('title', style.title);
        }

        // 更新卡片透明度
        Object.values(NodeStyleConfig).forEach(s => {
            card.classList.remove(s.card);
        });
        card.classList.add(style.card);

        // 如果节点在线，更新统计数据
        if (status === NodeStatus.ONLINE && node.stat) {
            // CPU数据更新
            const cpuEl = document.getElementById(`${sid}_CPU`);
            if (cpuEl && node.stat.cpu) {
                const cpuUsage = (node.stat.cpu * 100).toFixed(1);
                cpuEl.style.width = `${cpuUsage}%`;
                cpuEl.textContent = `${cpuUsage}%`;
                updateTooltip(cpuEl, `CPU使用率: ${cpuUsage}%`);
            }

            // 内存数据更新
            const memEl = document.getElementById(`${sid}_MEM`);
            if (memEl && node.stat.mem) {
                const memTotal = node.stat.mem.total;
                const memUsed = node.stat.mem.used;
                const memUsage = ((memUsed / memTotal) * 100).toFixed(1);
                memEl.style.width = `${memUsage}%`;
                memEl.textContent = `${memUsage}%`;
                updateTooltip(memEl, `内存使用: ${strB(memUsed)} / ${strB(memTotal)}`);
            }

            // 网络数据更新
            if (node.stat.net) {
                const netStats = {
                    in: node.stat.net.in || 0,
                    out: node.stat.net.out || 0,
                    total_in: node.stat.net.total_in || 0,
                    total_out: node.stat.net.total_out || 0
                };

                // 更新网络速度
                const netInEl = document.getElementById(`${sid}_NET_IN`);
                const netOutEl = document.getElementById(`${sid}_NET_OUT`);
                if (netInEl) {
                    netInEl.textContent = strbps(netStats.in);
                    updateTooltip(netInEl, `下载速度: ${strbps(netStats.in)}`);
                }
                if (netOutEl) {
                    netOutEl.textContent = strbps(netStats.out);
                    updateTooltip(netOutEl, `上传速度: ${strbps(netStats.out)}`);
                }

                // 更新总流量
                const netInTotalEl = document.getElementById(`${sid}_NET_IN_TOTAL`);
                const netOutTotalEl = document.getElementById(`${sid}_NET_OUT_TOTAL`);
                if (netInTotalEl) {
                    netInTotalEl.textContent = strB(netStats.total_in);
                    updateTooltip(netInTotalEl, `总下载: ${strB(netStats.total_in)}`);
                }
                if (netOutTotalEl) {
                    netOutTotalEl.textContent = strB(netStats.total_out);
                    updateTooltip(netOutTotalEl, `总上传: ${strB(netStats.total_out)}`);
                }

                console.debug(`节点 ${sid} 网络数据已更新:`, netStats);
            } else {
                console.debug(`节点 ${sid} 无网络数据`);
            }
        } else {
            // 节点离线，清空所有数据显示
            const elements = ['CPU', 'MEM', 'NET_IN', 'NET_OUT', 'NET_IN_TOTAL', 'NET_OUT_TOTAL'];
            elements.forEach(type => {
                const el = document.getElementById(`${sid}_${type}`);
                if (el) {
                    if (type === 'CPU' || type === 'MEM') {
                        el.style.width = '0%';
                    }
                    el.textContent = type.includes('NET') ? '0' : '0%';
                    updateTooltip(el, '节点离线');
                }
            });
        }

        // 更新到期时间
        const expireEl = document.getElementById(`${sid}_expire`);
        if (expireEl) {
            expireEl.textContent = formatRemainingDays(node.expire_time);
        }
    },
    
    // 防抖更新
    debounceUpdate() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        
        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastUpdateTime;
        
        if (timeSinceLastUpdate >= this.MIN_UPDATE_INTERVAL) {
            this.update();
        } else {
            this.updateTimer = setTimeout(() => {
                this.update();
            }, this.MIN_UPDATE_INTERVAL - timeSinceLastUpdate);
        }
    }
};

// 初始化系统
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 等待 SystemInitializer 完成初始化
        await SystemInitializer.init();
        
        // 继续执行 stats.js 特有的初始化逻辑（如果有）
        if (typeof StatsController !== 'undefined') {
            await StatsController.update();
        }
    } catch (error) {
        console.error('stats.js 初始化失败:', error);
    }
});

/**
 * 切换分组显示
 * @param {string} groupId - 目标分组ID
 */
function switchGroup(groupId) {
    // 1. 更新状态
    currentGroupId = groupId;
    
    // 2. 获取所有分组视图
    const allViews = document.querySelectorAll('.group-view');
    const targetView = document.querySelector(`.group-view[data-group="${groupId}"]`);
    
    if (!targetView) {
        console.error('目标分组视图未找到:', groupId);
        return;
    }

    // 3. 切换前准备 - 设置绝对定位
    allViews.forEach(view => {
        if (!view.classList.contains('hidden')) {
            const rect = view.getBoundingClientRect();
            view.style.position = 'absolute';
            view.style.top = `${rect.top}px`;
            view.style.left = `${rect.left}px`;
            view.style.width = `${rect.width}px`;
            view.style.height = `${rect.height}px`;
            view.style.zIndex = '1';
        }
    });
    
    // 4. 准备目标视图
    targetView.classList.remove('hidden');
    targetView.style.position = 'relative';
    targetView.style.zIndex = '2';
    targetView.style.opacity = '0';
    
    // 5. 执行切换
    requestAnimationFrame(() => {
        // 淡出当前视图
        allViews.forEach(view => {
            if (view !== targetView && !view.classList.contains('hidden')) {
                view.style.opacity = '0';
                view.addEventListener('transitionend', function handler() {
                    view.classList.add('hidden');
                    view.style.position = '';
                    view.style.top = '';
                    view.style.left = '';
                    view.style.width = '';
                    view.style.height = '';
                    view.style.zIndex = '';
                    view.removeEventListener('transitionend', handler);
                }, { once: true });
            }
        });

        // 淡入目标视图
        requestAnimationFrame(() => {
            targetView.style.opacity = '1';
        });
    });
    
    // 6. 更新Tab状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.group === groupId);
    });
    
    // 7. 重新应用当前排序
    if (window.currentSortConfig) {
        applySort(window.currentSortConfig.type, window.currentSortConfig.direction);
    }
}

function initTabs() {
    // 获取所有tab按钮
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    // 为每个按钮添加点击事件
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const groupId = button.getAttribute('data-group');
            if (groupId) {
                switchGroup(groupId);
            }
        });
    });

    // 初始化时激活"全部"分组
    switchGroup('all');
}

/**
 * 应用排序
 * @param {string} type - 排序类型
 * @param {string} direction - 排序方向
 */
function applySort(type, direction) {
    console.debug('执行排序:', { type, direction });
    
    const activeTab = document.querySelector('.tab-btn.active');
    if (!activeTab) {
        console.warn('未找到活动的标签页');
        return;
    }
    
    const activeGroupId = activeTab.dataset.group;
    const activeView = document.querySelector(`.group-view[data-group="${activeGroupId}"]`);
    if (!activeView) {
        console.warn('未找到活动的视图组');
        return;
    }

    // 获取可见的卡片
    const cards = Array.from(activeView.querySelectorAll('.server-card')).filter(card => 
        card.style.display !== 'none'
    );
    
    console.debug('待排序的卡片数量:', cards.length);

    // 保存拖拽相关的属性和事件
    const preserveDragData = (card) => {
        return {
            dragData: card.getAttribute('draggable'),
            dragEvents: card.getAttribute('data-has-drag-events') === 'true'
        };
    };

    // 排序前保存所有卡片的拖拽状态
    const dragStates = cards.map(card => ({
        element: card,
        state: preserveDragData(card)
    }));

    // 获取排序值的函数
    const getSortValue = (card, type) => {
        let value = 0;
        switch(type) {
            case 'default':
                return Number(card.dataset.top || 0);
            case 'cpu':
                value = Number(card.querySelector('[id$="_CPU"]')?.dataset.cpu || 0);
                break;
            case 'memory':
                value = Number(card.querySelector('[id$="_MEM"]')?.dataset.memory || 0);
                break;
            case 'download':
                const downloadText = card.querySelector('[id$="_NET_IN"]')?.textContent || '0 bps';
                value = parseNetworkValue(downloadText);
                break;
            case 'upload':
                const uploadText = card.querySelector('[id$="_NET_OUT"]')?.textContent || '0 bps';
                value = parseNetworkValue(uploadText);
                break;
            case 'expiration':
                const expireText = card.querySelector('[id$="_EXPIRE_TIME"]')?.textContent;
                if (expireText === '永久') return Number.MAX_SAFE_INTEGER;
                if (expireText === '已过期') return -1;
                if (expireText === '今日到期') return 0;
                const days = parseInt(expireText.match(/\d+/)?.[0] || 0);
                return days;
            default:
                return 0;
        }
        return value;
    };

    // 解析网络值的辅助函数
    const parseNetworkValue = (text) => {
        const match = text.match(/^([\d.]+)\s*(\w+)$/);
        if (!match) return 0;
        
        const [_, value, unit] = match;
        const numValue = parseFloat(value);
        
        switch(unit.toLowerCase()) {
            case 'bps': return numValue;
            case 'kbps': return numValue * 1000;
            case 'mbps': return numValue * 1000000;
            case 'gbps': return numValue * 1000000000;
            case 'tbps': return numValue * 1000000000000;
            default: return 0;
        }
    };

    // 执行排序
    cards.sort((a, b) => {
        // 获取在线状态
        const isOnlineA = a.querySelector('[id$="_status_indicator"]')?.classList.contains('bg-green-500') || false;
        const isOnlineB = b.querySelector('[id$="_status_indicator"]')?.classList.contains('bg-green-500') || false;
        
        // 如果在线状态不同,在线的排在前面
        if (isOnlineA !== isOnlineB) {
            return isOnlineA ? -1 : 1;
        }

        // 如果是默认排序,只按top值排序
        if (type === 'default') {
            const topA = Number(a.dataset.top || 0);
            const topB = Number(b.dataset.top || 0);
            return direction === 'asc' ? topA - topB : topB - topA;
        }

        // 获取排序值
        const valueA = getSortValue(a, type);
        const valueB = getSortValue(b, type);

        // 如果值相同,按top值排序
        if (valueA === valueB) {
            const topA = Number(a.dataset.top || 0);
            const topB = Number(b.dataset.top || 0);
            return topB - topA;
        }

        // 根据排序方向返回比较结果
        return direction === 'asc' ? valueA - valueB : valueB - valueA;
    });

    // 获取正确的容器
    const container = activeGroupId === 'all' ? 
        activeView.querySelector('.grid') : 
        document.getElementById(`card-grid-${activeGroupId}`);

    if (container) {
        console.debug('排序完成,更新DOM');
        // 重新排序DOM元素
        cards.forEach(card => container.appendChild(card));
        
        // 恢复拖拽状态
        dragStates.forEach(({element, state}) => {
            if (state.dragData) {
                element.setAttribute('draggable', state.dragData);
            }
            if (state.dragEvents) {
                element.setAttribute('data-has-drag-events', 'true');
            }
        });
    } else {
        console.warn('未找到卡片容器');
    }
}

// 应用当前排序
function applyCurrentSort() {
    const currentSortBtn = document.querySelector('.sort-btn.active');
    if (currentSortBtn) {
        const type = currentSortBtn.dataset.sort;
        const direction = currentSortBtn.dataset.direction || 'desc';
        applySort(type, direction);
    }
}

// 初始化排序按钮事件
function initSortButtons() {
    const sortButtons = document.querySelectorAll('.sort-btn');
    console.debug('初始化排序按钮:', sortButtons.length);
    
    // 设置默认排序按钮
    const defaultSortBtn = document.querySelector('[data-sort="default"]');
    if (defaultSortBtn) {
        defaultSortBtn.classList.add('active');
        defaultSortBtn.dataset.direction = 'desc';
        defaultSortBtn.querySelector('i').textContent = 'expand_more';
        console.debug('已设置默认排序按钮:', defaultSortBtn.dataset.sort);
        
        // 初始化时执行一次默认排序
        applySort('default', 'desc');
    } else {
        console.warn('未找到默认排序按钮');
    }
    
    sortButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.sort;
            let direction = !btn.classList.contains('active') ? 'desc' : 
                           (btn.dataset.direction === 'asc' ? 'desc' : 'asc');
            
            btn.dataset.direction = direction;
            sortButtons.forEach(b => {
                b.classList.remove('active');
                const icon = b.querySelector('i');
                if (icon) icon.textContent = 'unfold_more';
            });
            
            btn.classList.add('active');
            const icon = btn.querySelector('i');
            if (icon) {
                icon.textContent = direction === 'asc' ? 'expand_less' : 'expand_more';
            }
            
            applySort(type, direction);
        });
    });

    // 实时排序复选框事件
    const realtimeSort = document.getElementById('realtime-sort');
    if (realtimeSort) {
        realtimeSort.checked = true;
        console.debug('已启用实时排序');
        realtimeSort.addEventListener('change', () => {
            console.debug('实时排序设置变更:', realtimeSort.checked);
            if (realtimeSort.checked) {
                applyCurrentSort();
            }
        });
    } else {
        console.warn('未找到实时排序复选框');
    }
}

// 添加设置变更监听
document.addEventListener('DOMContentLoaded', () => {
    // 初始化排序按钮
    initSortButtons();
    
    // 加载保存的设置
    const settings = loadSettings();
    
    // 设置复选框初始状态
    const sensitiveCheckbox = document.getElementById('show-sensitive');
    const offlineCheckbox = document.getElementById('hide-offline');
    
    if (sensitiveCheckbox) {
        sensitiveCheckbox.checked = settings.hideSensitive;
        sensitiveCheckbox.addEventListener('change', function(e) {
            settings.hideSensitive = e.target.checked;
            saveSettings(settings);
            StatsController.update();
        });
    }
    
    if (offlineCheckbox) {
        offlineCheckbox.checked = settings.hideOffline;
        offlineCheckbox.addEventListener('change', function(e) {
            settings.hideOffline = e.target.checked;
            saveSettings(settings);
            StatsController.update();
        });
    }
    
    // 应用初始排序
    applyCurrentSort();
});

