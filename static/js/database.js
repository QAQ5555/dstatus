/**
 * 数据库管理模块
 * 提供数据库备份和恢复功能
 */
window.DatabaseManager = {
    /**
     * 下载数据库备份
     */
    downloadBackup() {
        window.location.href = '/admin/db/backup';
    },

    /**
     * 开始恢复流程
     */
    startRestore() {
        document.getElementById('dbFileInput').click();
    },

    /**
     * 处理文件选择
     * @param {HTMLInputElement} input - 文件输入元素
     */
    handleFileSelect(input) {
        if (!input.files || !input.files[0]) return;
        
        const file = input.files[0];
        if (!file.name.endsWith('.db')) {
            this.showError('请选择正确的数据库文件（.db）');
            return;
        }

        this.showDialog();
        this.handleRestore(file);
    },

    /**
     * 处理数据库恢复
     * @param {File} file - 数据库文件
     */
    async handleRestore(file) {
        try {
            const formData = new FormData();
            formData.append('database', file);

            this.showState('upload');
            const response = await fetch('/admin/db/restore', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.status) {
                this.showState('restore');
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                this.showState('restart');
                
                // 等待服务器关闭
                await this.waitForServerDown();
                console.log('服务器已关闭，等待重启...');
                
                // 等待服务器重启
                await this.waitForServerUp();
                console.log('服务器已重启，准备显示完成状态...');
                
                // 显示完成状态
                this.showCompleted();
                
                // 延迟刷新页面，给用户时间查看完成状态
                setTimeout(() => {
                    window.location.reload();
                }, 3000);
            } else {
                this.showError(result.data);
            }
        } catch (error) {
            console.error('恢复过程出错:', error);
            if (error.message.includes('重启超时')) {
                this.showError('服务器重启超时，请手动刷新页面');
            } else {
                this.showError('恢复过程出错: ' + error.message);
            }
        }
    },

    /**
     * 等待服务器关闭
     */
    async waitForServerDown() {
        let attempts = 0;
        const maxAttempts = 30;
        const interval = 500; // 缩短检查间隔到500ms
        
        while (attempts < maxAttempts) {
            try {
                const response = await fetch('/health');
                if (!response.ok) {
                    return true; // 服务器返回错误状态也认为是已关闭
                }
                await new Promise(resolve => setTimeout(resolve, interval));
                attempts++;
            } catch (e) {
                // 服务器已关闭
                return true;
            }
        }
        throw new Error('等待服务器关闭超时');
    },

    /**
     * 等待服务器恢复
     */
    async waitForServerUp() {
        let attempts = 0;
        const maxAttempts = 60;
        const interval = 1000;
        let lastError = null;
        
        const checkServer = async () => {
            try {
                const response = await fetch('/health');
                if (response.ok) {
                    const data = await response.json();
                    return data.status === 'ok';
                }
                return false;
            } catch (e) {
                lastError = e;
                return false;
            }
        };

        while (attempts < maxAttempts) {
            this.updateRestartStatus(`正在等待服务器恢复... (${attempts}/${maxAttempts})`);
            
            if (await checkServer()) {
                // 服务器恢复后，等待一段时间确保应用完全启动
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // 再次确认服务器状态
                if (await checkServer()) {
                    this.updateRestartStatus('服务器已恢复，正在刷新页面...');
                    return true;
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, interval));
            attempts++;
        }
        
        throw new Error(`服务器重启超时 ${lastError ? ': ' + lastError.message : ''}`);
    },

    /**
     * 更新重启状态显示
     */
    updateRestartStatus(message) {
        const statusElement = document.getElementById('restartStatus');
        if (statusElement) {
            statusElement.textContent = message;
        }
    },

    /**
     * 显示对话框
     */
    showDialog() {
        const dialog = document.getElementById('restoreDialog');
        dialog.classList.remove('hidden');
        dialog.classList.add('flex');
    },

    /**
     * 关闭对话框
     */
    closeDialog() {
        const dialog = document.getElementById('restoreDialog');
        dialog.classList.add('hidden');
        dialog.classList.remove('flex');
        this.resetStates();
    },

    /**
     * 显示特定状态
     * @param {string} state - 状态名称
     */
    showState(state) {
        this.resetStates();
        const element = document.getElementById(`${state}State`);
        if (element) {
            element.classList.remove('hidden');
        }
    },

    /**
     * 重置所有状态
     */
    resetStates() {
        ['upload', 'restore', 'restart', 'success', 'error'].forEach(state => {
            const element = document.getElementById(`${state}State`);
            if (element) {
                element.classList.add('hidden');
            }
        });
    },

    /**
     * 显示错误
     * @param {string} message - 错误信息
     */
    showError(message) {
        this.showState('error');
        document.getElementById('errorMessage').textContent = message;
    },

    /**
     * 显示完成状态
     */
    showCompleted() {
        this.showState('success');
        this.updateRestartStatus('恢复完成，系统已重启');
    }
}; 