/**
 * 流量数据处理工具函数
 */

// 基础工具函数
function validateTrafficValue(value) {
    const numValue = Number(value) || 0;
    return Math.max(0, numValue);
}

// 从URL获取服务器ID
function getNodeIdFromUrl() {
    const path = window.location.pathname;
    const matches = path.match(/\/stats\/([^\/]+)/);
    return matches ? matches[1] : null;
}

// 防止重复调用的标志
let isUpdating = false;

// 更新流量显示
async function updateTrafficDisplay() {
    if (isUpdating) return;
    isUpdating = true;
    
    try {
        const nodeId = getNodeIdFromUrl();
        console.log('[Traffic Utils] 当前节点ID:', nodeId);
        if (!nodeId) return;

        // 1. 首先从traffic_data获取历史流量数据
        const trafficData = document.getElementById('traffic_data');
        let trafficStats = null;
        if (trafficData) {
            try {
                trafficStats = JSON.parse(trafficData.value);
                console.log('[Traffic Utils] 从traffic_data获取到的历史流量数据:', trafficStats);
                
                // 确保trafficStats包含必要的数组
                if (!trafficStats.ds) trafficStats.ds = new Array(31).fill([0,0]);
                if (!trafficStats.hs) trafficStats.hs = new Array(24).fill([0,0]);
                if (!trafficStats.ms) trafficStats.ms = new Array(12).fill([0,0]);
            } catch (e) {
                console.error('[Traffic Utils] 解析traffic_data失败:', e);
                trafficStats = {
                    ds: new Array(31).fill([0,0]),
                    hs: new Array(24).fill([0,0]),
                    ms: new Array(12).fill([0,0])
                };
            }
        }

        // 2. 从preprocessed-data获取流量配置数据
        const preprocessedData = document.getElementById('preprocessed-data');
        let nodeData = null;
        if (preprocessedData) {
            try {
                nodeData = JSON.parse(preprocessedData.value);
                console.log('[Traffic Utils] 从preprocessed-data获取到的节点配置:', nodeData);
            } catch (e) {
                console.error('[Traffic Utils] 解析preprocessed-data失败:', e);
            }
        }

        // 3. 合并数据
        if (nodeData && trafficStats) {
            const normalizedData = {
                ds: trafficStats.ds || new Array(31).fill([0,0]),
                hs: trafficStats.hs || new Array(24).fill([0,0]),
                ms: trafficStats.ms || new Array(12).fill([0,0]),
                traffic_calibration_date: nodeData.traffic_calibration_date || 0,
                traffic_calibration_value: nodeData.traffic_calibration_value || 0,
                traffic_reset_day: nodeData.traffic_reset_day || 1,
                traffic_limit: nodeData.traffic_limit || 0,
                traffic_used: nodeData.traffic_used || 0
            };
            console.log('[Traffic Utils] 合并后的完整数据:', normalizedData);
            updateTrafficElements(normalizedData);
        }

        // 4. 获取实时数据更新
        console.log('[Traffic Utils] 开始请求实时流量数据...');
        const response = await fetch(`/stats/${nodeId}/traffic`);
        const { data, error } = await response.json();
        
        if (!error && data) {
            // 合并实时数据和历史数据
            const normalizedData = {
                ds: data.ds || (trafficStats ? trafficStats.ds : new Array(31).fill([0,0])),
                hs: data.hs || (trafficStats ? trafficStats.hs : new Array(24).fill([0,0])),
                ms: data.ms || (trafficStats ? trafficStats.ms : new Array(12).fill([0,0])),
                traffic_calibration_date: data.calibration_date || 0,
                traffic_calibration_value: data.calibration_value || 0,
                traffic_reset_day: data.traffic_reset_day || 1,
                traffic_limit: data.traffic_limit || 0,
                traffic_used: data.traffic_used || 0
            };
            console.log('[Traffic Utils] 合并后的实时数据:', normalizedData);
            updateTrafficElements(normalizedData);
        }
    } catch (error) {
        console.error('[Traffic Utils] 更新流量显示失败:', error);
    } finally {
        isUpdating = false;
    }
}

// 格式化流量数值
function formatTraffic(bytes) {
    if (bytes === null || bytes === undefined || isNaN(bytes)) {
        return '0 B';
    }

    let value = Number(bytes);
    if (!isFinite(value)) {
        return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    value = Math.abs(value);

    if (value === 0) return '0 B';

    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }

    let decimals = 2;
    if (value >= 100) decimals = 1;
    else if (value >= 10) decimals = 2;

    return value.toFixed(decimals) + ' ' + units[unitIndex];
}

// 更新进度条样式
function updateProgressBarStyle(progressBar, ratio, isUnlimited) {
    if (isUnlimited) {
        progressBar.classList.add('bg-green-500/50');
        progressBar.classList.remove('bg-blue-500/50', 'bg-yellow-500/50', 'bg-red-500/50');
    } else {
        progressBar.classList.remove('bg-green-500/50');
        if (ratio >= 0.9) {
            progressBar.classList.add('bg-red-500/50');
            progressBar.classList.remove('bg-blue-500/50', 'bg-yellow-500/50');
        } else if (ratio >= 0.7) {
            progressBar.classList.add('bg-yellow-500/50');
            progressBar.classList.remove('bg-blue-500/50', 'bg-red-500/50');
        } else {
            progressBar.classList.add('bg-blue-500/50');
            progressBar.classList.remove('bg-yellow-500/50', 'bg-red-500/50');
        }
    }
}

/**
 * 更新显示元素
 * @param {Object} data - 流量数据对象
 */
function updateTrafficElements(data) {
    if (!data) {
        console.error('[Traffic Utils] 没有收到流量数据');
        return;
    }
    
    console.log('[Traffic Utils] 开始更新流量显示元素, 数据:', data);
    
    try {
        // 1. 数据规范化
        const normalizedData = {
            ds: Array.isArray(data.ds) ? data.ds : [],
            traffic_reset_day: parseInt(data.traffic_reset_day) || 1,
            traffic_calibration_date: parseInt(data.traffic_calibration_date) || 0,
            traffic_calibration_value: parseFloat(data.traffic_calibration_value) || 0,
            traffic_limit: parseFloat(data.traffic_limit) || 0
        };
        console.log('[Traffic Utils] 规范化后的数据:', normalizedData);

        // 2. 计算流量
        const usedTraffic = calculateUsedTraffic({
            trafficData: normalizedData.ds,
            resetDay: normalizedData.traffic_reset_day,
            calibrationDate: normalizedData.traffic_calibration_date,
            calibrationValue: normalizedData.traffic_calibration_value
        });
        console.log('[Traffic Utils] 计算得到的已用流量(GB):', usedTraffic);

        // 3. 计算剩余流量
        const remaining = calculateRemainingTraffic({
            used: usedTraffic,
            limit: normalizedData.traffic_limit
        });
        console.log('[Traffic Utils] 计算得到的剩余流量(GB):', remaining);

        // 4. 更新显示
        // 4.1 更新已用流量
        const usedElement = document.getElementById('traffic-used');
        if (usedElement) {
            usedElement.textContent = formatTraffic(usedTraffic * 1024 * 1024 * 1024);
            console.log('[Traffic Utils] 已更新已用流量显示:', formatTraffic(usedTraffic * 1024 * 1024 * 1024));
        } else {
            console.error('[Traffic Utils] 未找到已用流量显示元素');
        }

        // 4.2 更新剩余流量
        const remainingElement = document.getElementById('traffic-remaining');
        if (remainingElement) {
            remainingElement.textContent = remaining === -1 ? '∞' : formatTraffic(remaining * 1024 * 1024 * 1024);
            console.log('[Traffic Utils] 已更新剩余流量显示:', remaining === -1 ? '∞' : formatTraffic(remaining * 1024 * 1024 * 1024));
        } else {
            console.error('[Traffic Utils] 未找到剩余流量显示元素');
        }

        // 4.3 更新总流量限制
        const limitElement = document.getElementById('traffic-limit');
        if (limitElement) {
            limitElement.textContent = normalizedData.traffic_limit ? formatTraffic(normalizedData.traffic_limit * 1024 * 1024 * 1024) : '∞';
            console.log('[Traffic Utils] 已更新总流量限制显示:', normalizedData.traffic_limit ? formatTraffic(normalizedData.traffic_limit * 1024 * 1024 * 1024) : '∞');
        } else {
            console.error('[Traffic Utils] 未找到总流量限制显示元素');
        }

        // 4.4 更新进度条
        const progressBar = document.getElementById('traffic-progress-bar');
        if (progressBar) {
            const ratio = normalizedData.traffic_limit ? 
                Math.min(1, usedTraffic / normalizedData.traffic_limit) : 0;
            progressBar.style.transform = `scaleX(${ratio})`;
            console.log('[Traffic Utils] 已更新进度条:', ratio);

            // 根据使用比例更新颜色
            if (!normalizedData.traffic_limit) {
                progressBar.classList.add('bg-green-500/50');
                progressBar.classList.remove('bg-blue-500/50', 'bg-yellow-500/50', 'bg-red-500/50');
            } else {
                progressBar.classList.remove('bg-green-500/50');
                if (ratio >= 0.9) {
                    progressBar.classList.add('bg-red-500/50');
                    progressBar.classList.remove('bg-blue-500/50', 'bg-yellow-500/50');
                } else if (ratio >= 0.7) {
                    progressBar.classList.add('bg-yellow-500/50');
                    progressBar.classList.remove('bg-blue-500/50', 'bg-red-500/50');
                } else {
                    progressBar.classList.add('bg-blue-500/50');
                    progressBar.classList.remove('bg-yellow-500/50', 'bg-red-500/50');
                }
            }
        } else {
            console.error('[Traffic Utils] 未找到进度条元素');
        }
    } catch (error) {
        console.error('[Traffic Utils] 更新流量显示元素失败:', error);
    }
}

// 设置定时更新
function setupTrafficUpdates() {
    // 设置每分钟更新一次
    setInterval(updateTrafficDisplay, 60 * 1000);
}

// 页面加载时初始化
let initialized = false;
document.addEventListener('DOMContentLoaded', () => {
    if (!initialized) {
        console.log('[Traffic Utils] 开始初始化流量数据模块...');
        initialized = true;
        
        // 立即执行一次更新
        updateTrafficDisplay().then(() => {
            console.log('[Traffic Utils] 初始流量数据更新完成');
        }).catch(error => {
            console.error('[Traffic Utils] 初始流量数据更新失败:', error);
        });
        
        // 设置定时更新
        setupTrafficUpdates();
        console.log('[Traffic Utils] 流量数据定时更新已设置');
    }
});

/**
 * 计算指定日期范围内的流量总和
 * @param {Array} trafficData ds数据数组
 * @param {number} startTime 开始时间戳
 * @param {number} endTime 结束时间戳
 * @returns {number} 总流量
 */
function calculateTrafficInRange(trafficData, startTime, endTime) {
    if (!trafficData || !Array.isArray(trafficData)) return 0;
    
    let totalTraffic = 0;
    const now = Math.floor(Date.now() / 1000);
    
    for (const record of trafficData) {
        if (Array.isArray(record) && record.length >= 2) {
            const inbound = validateTrafficValue(record[0]);
            const outbound = validateTrafficValue(record[1]);
            totalTraffic += inbound + outbound;
        }
    }
    
    return totalTraffic;
}

/**
 * 计算上一个流量重置日期
 * @param {Date} now 当前日期
 * @param {number} resetDay 重置日
 * @returns {Date} 上一个重置日期
 */
function calculateLastResetDate(now, resetDay) {
    const lastReset = new Date(now.getFullYear(), now.getMonth(), resetDay);
    
    // 如果重置日期在当前日期之后，回退到上个月
    if (lastReset > now) {
        lastReset.setMonth(lastReset.getMonth() - 1);
    }
    
    lastReset.setHours(0, 0, 0, 0);
    return lastReset;
}

/**
 * 计算已用流量
 * @param {Object} params 计算参数
 * @param {Array} params.trafficData ds数据数组 [[入站,出站,时间戳],...]
 * @param {number} params.resetDay 重置日
 * @param {number} params.calibrationDate 校准日期
 * @param {number} params.calibrationValue 校准值
 * @returns {number} 已用流量
 */
function calculateUsedTraffic({trafficData, resetDay, calibrationDate, calibrationValue}) {
    console.log('[Traffic Utils] 计算已用流量, 参数:', {
        trafficData: trafficData?.length,
        resetDay,
        calibrationDate,
        calibrationValue
    });

    // 1. 验证输入
    if (!Array.isArray(trafficData)) {
        console.warn('[Traffic Utils] trafficData不是数组');
        return 0;
    }
    
    // 2. 计算重置日期
    const now = new Date();
    const lastResetDate = calculateLastResetDate(now, resetDay);
    console.log('[Traffic Utils] 上次重置日期:', lastResetDate);
    
    // 3. 计算本月总流量
    let totalTraffic = 0;
    
    // 如果有校准日期且在上次重置之后，使用校准值
    if (calibrationDate && calibrationDate > lastResetDate.getTime()/1000) {
        totalTraffic = calibrationValue;
        console.log('[Traffic Utils] 使用校准值:', calibrationValue);
    }
    
    // 4. 计算当月流量
    // 获取当月的数据（最后一个元素是最新的）
    const currentMonthData = trafficData[trafficData.length - 1];
    if (Array.isArray(currentMonthData) && currentMonthData.length >= 2) {
        const inbound = validateTrafficValue(currentMonthData[0]);
        const outbound = validateTrafficValue(currentMonthData[1]);
        // 将字节转换为GB
        totalTraffic = (inbound + outbound) / (1024 * 1024 * 1024);
        console.log('[Traffic Utils] 当月流量数据:', { 
            inbound: formatTraffic(inbound), 
            outbound: formatTraffic(outbound), 
            total: formatTraffic(inbound + outbound) 
        });
    }
    
    console.log('[Traffic Utils] 计算得到总流量:', formatTraffic(totalTraffic * 1024 * 1024 * 1024));
    return totalTraffic;
}

/**
 * 计算剩余流量
 * @param {Object} params 计算参数
 * @param {number} params.used 已用流量
 * @param {number} params.limit 流量限制
 * @returns {number} 剩余流量，-1表示无限制
 */
function calculateRemainingTraffic({used, limit}) {
    const usedTraffic = Math.max(0, Number(used) || 0);
    const trafficLimit = Math.max(0, Number(limit) || 0);
    
    if (!trafficLimit) return -1;  // 无限制返回-1
    return Math.max(0, trafficLimit - usedTraffic);
}

/**
 * 计算流量使用百分比
 * @param {number} used 已用流量
 * @param {number} limit 流量限制
 * @returns {number} 流量使用百分比
 */
function calculateTrafficUsageRatio(used, limit) {
    if (limit === 0) return 0;
    return Math.min(100, Math.max(0, (used / limit) * 100));
}

/**
 * 格式化流量使用百分比
 * @param {number} used 已用流量
 * @param {number} limit 流量限制
 * @returns {string} 格式化的流量使用百分比
 */
function formatPercentage(used, limit) {
    const ratio = calculateTrafficUsageRatio(used, limit);
    return `${ratio.toFixed(2)}%`;
}