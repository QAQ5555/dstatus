/**
 * 流量单位转换工具函数
 * 提供GB和Bytes之间的转换
 */

/**
 * 流量格式化工具函数
 */
window.TrafficFormat = {
    /**
     * 将字节数转换为GB
     * @param {number} bytes 字节数
     * @returns {number} GB值,保留2位小数
     */
    bytesToGB(bytes) {
        if (!bytes) return 0;
        return Number((bytes / (1024 * 1024 * 1024)).toFixed(2));
    },

    /**
     * 将GB转换为字节数
     * @param {number} gb GB值
     * @returns {number} 字节数
     */
    gbToBytes(gb) {
        if (!gb) return 0;
        return Math.floor(gb * 1024 * 1024 * 1024);
    },

    /**
     * 格式化流量数值为可读字符串
     * @param {number} bytes 字节数
     * @returns {string} 格式化后的字符串
     */
    formatBytes(bytes) {
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
    },

    /**
     * 格式化GB值为可读字符串
     * @param {number} gb GB值
     * @returns {string} 格式化后的字符串
     */
    formatGB(gb) {
        return this.formatBytes(this.gbToBytes(gb));
    }
}; 