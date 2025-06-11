document.addEventListener('DOMContentLoaded', function() {
  // 标签页切换
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // 移除所有标签的active类
      tabs.forEach(t => t.classList.remove('active'));
      // 添加当前标签的active类
      this.classList.add('active');
      
      // 隐藏所有内容
      document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
      });
      
      // 显示当前标签对应的内容
      const tabId = this.getAttribute('data-tab');
      document.getElementById(tabId + '-tab').style.display = 'block';
      
      // 如果切换到白名单标签，加载白名单数据
      if (tabId === 'whitelist') {
        loadWhitelist();
      }
    });
  });
  
  // 获取当前活动标签页的指纹识别结果
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {type: 'GET_MATCHES'}, function(response) {
        if (response) {
          displayResults(response.matches, response.isWhitelisted, response.error);
        } else {
          // 如果没有响应，显示未识别状态
          displayResults([], false, null);
        }
      });
    }
  });
  
  // 刷新按钮点击事件
  document.getElementById('refreshBtn').addEventListener('click', function() {
    // 显示加载状态
    document.getElementById('results').innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <div class="loading-text">正在扫描中...</div>
      </div>
    `;
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {type: 'SCAN_PAGE'}, function(response) {
          if (response) {
            displayResults(response.matches, response.isWhitelisted, response.error);
          } else {
            // 如果扫描失败或没有响应
            displayResults([], false, '扫描失败，请重试');
          }
        });
      }
    });
  });
  
  // 添加指纹表单提交事件
  document.getElementById('addFingerForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    // 获取表单数据
    const cms = document.getElementById('cms').value;
    const method = document.getElementById('method').value;
    const location = document.getElementById('location').value;
    const type = document.getElementById('type').value;
    const isImportant = document.getElementById('isImportant').checked;
    
    // 获取所有关键词
    const keywordInputs = document.querySelectorAll('.keyword-input');
    const keywords = Array.from(keywordInputs).map(input => input.value).filter(kw => kw.trim() !== '');
    
    if (keywords.length === 0) {
      document.getElementById('addStatus').innerHTML = '<div class="error-message">请至少添加一个关键词</div>';
      return;
    }
    
    // 创建新指纹
    const newFingerprint = {
      cms: cms,
      method: method,
      location: location,
      keyword: keywords,
      type: type,
      isImportant: isImportant
    };
    
    // 保存到存储
    chrome.storage.local.get(['customFingerprints'], function(result) {
      const customFingerprints = result.customFingerprints || [];
      customFingerprints.push(newFingerprint);
      
      chrome.storage.local.set({customFingerprints: customFingerprints}, function() {
        document.getElementById('addStatus').innerHTML = '<div class="success-message">指纹添加成功！</div>';
        document.getElementById('addFingerForm').reset();
        
        // 重置关键词输入框
        const keywordContainer = document.getElementById('keywordContainer');
        keywordContainer.innerHTML = `
          <div class="keyword-item">
            <input type="text" class="form-control keyword-input" required>
            <button type="button" class="btn btn-secondary remove-keyword" disabled>-</button>
          </div>
        `;
        
        // 清除状态消息
        setTimeout(() => {
          document.getElementById('addStatus').innerHTML = '';
        }, 3000);
      });
    });
  });
  
  // 添加关键词按钮点击事件
  document.getElementById('addKeywordBtn').addEventListener('click', function() {
    const keywordContainer = document.getElementById('keywordContainer');
    const newKeywordItem = document.createElement('div');
    newKeywordItem.className = 'keyword-item';
    newKeywordItem.innerHTML = `
      <input type="text" class="form-control keyword-input" required>
      <button type="button" class="btn btn-secondary remove-keyword">-</button>
    `;
    
    keywordContainer.appendChild(newKeywordItem);
    
    // 启用所有删除按钮
    document.querySelectorAll('.remove-keyword').forEach(btn => {
      btn.disabled = document.querySelectorAll('.keyword-item').length <= 1;
    });
    
    // 为新添加的删除按钮添加事件
    newKeywordItem.querySelector('.remove-keyword').addEventListener('click', removeKeyword);
  });
  
  // 删除关键词函数
  function removeKeyword() {
    this.parentElement.remove();
    
    // 如果只剩一个关键词输入框，禁用删除按钮
    document.querySelectorAll('.remove-keyword').forEach(btn => {
      btn.disabled = document.querySelectorAll('.keyword-item').length <= 1;
    });
  }
  
  // 导出指纹按钮点击事件
  document.getElementById('exportBtn').addEventListener('click', function() {
    chrome.storage.local.get(['customFingerprints'], function(result) {
      const customFingerprints = result.customFingerprints || [];
      
      if (customFingerprints.length === 0) {
        document.getElementById('addStatus').innerHTML = '<div class="error-message">没有自定义指纹可导出</div>';
        return;
      }
      
      // 创建下载链接
      const dataStr = JSON.stringify(customFingerprints, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = 'custom_fingerprints.json';
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      
      document.getElementById('addStatus').innerHTML = '<div class="success-message">指纹导出成功！</div>';
      
      // 清除状态消息
      setTimeout(() => {
        document.getElementById('addStatus').innerHTML = '';
      }, 3000);
    });
  });
  
  // 白名单表单提交事件
  document.getElementById('whitelistForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const urlInput = document.getElementById('whitelistUrl');
    let url = urlInput.value.trim();
    
    // 简单的URL验证
    if (!url) {
      document.getElementById('whitelistStatus').innerHTML = '<div class="error-message">请输入有效的域名</div>';
      return;
    }
    
    // 移除协议前缀
    url = url.replace(/^https?:\/\//, '');
    // 只保留域名部分
    url = url.split('/')[0];
    
    // 保存到白名单
    chrome.storage.local.get(['whitelist'], function(result) {
      const whitelist = result.whitelist || [];
      
      // 检查是否已存在
      if (whitelist.some(item => item.url === url)) {
        document.getElementById('whitelistStatus').innerHTML = '<div class="error-message">该域名已在白名单中</div>';
        return;
      }
      
      // 添加到白名单
      whitelist.push({
        url: url,
        addedAt: new Date().toISOString()
      });
      
      chrome.storage.local.set({whitelist: whitelist}, function() {
        document.getElementById('whitelistStatus').innerHTML = '<div class="success-message">已添加到白名单</div>';
        urlInput.value = '';
        
        // 刷新白名单列表
        loadWhitelist();
        
        // 清除状态消息
        setTimeout(() => {
          document.getElementById('whitelistStatus').innerHTML = '';
        }, 3000);
      });
    });
  });
  
  // 加载白名单列表
  function loadWhitelist() {
    const whitelistItems = document.getElementById('whitelistItems');
    whitelistItems.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <div class="loading-text">加载中...</div>
      </div>
    `;
    
    chrome.storage.local.get(['whitelist'], function(result) {
      const whitelist = result.whitelist || [];
      
      if (whitelist.length === 0) {
        whitelistItems.innerHTML = '<div class="no-match">白名单为空</div>';
        return;
      }
      
      let html = '';
      whitelist.forEach((item, index) => {
        const date = new Date(item.addedAt).toLocaleDateString();
        html += `
          <div class="whitelist-item">
            <div class="whitelist-url">${item.url}</div>
            <div class="whitelist-info">添加时间: ${date}</div>
            <button class="btn btn-danger remove-whitelist" data-index="${index}">删除</button>
          </div>
        `;
      });
      
      whitelistItems.innerHTML = html;
      
      // 添加删除按钮事件
      document.querySelectorAll('.remove-whitelist').forEach(btn => {
        btn.addEventListener('click', function() {
          const index = parseInt(this.getAttribute('data-index'));
          
          chrome.storage.local.get(['whitelist'], function(result) {
            const whitelist = result.whitelist || [];
            whitelist.splice(index, 1);
            
            chrome.storage.local.set({whitelist: whitelist}, function() {
              loadWhitelist();
            });
          });
        });
      });
    });
  }
  
  // 显示指纹识别结果 - 改进版本
  function displayResults(matches, isWhitelisted, error) {
    const resultsDiv = document.getElementById('results');
    
    // 如果有错误，优先显示错误信息
    if (error) {
      resultsDiv.innerHTML = `
        <div class="error-notice">
          <div class="error-icon">⚠️</div>
          <div class="error-message">
            <h4>加载失败</h4>
            <p>${error}</p>
            <button id="retryBtn" class="btn btn-primary" style="margin-top: 10px;">重试</button>
          </div>
        </div>
      `;
      
      // 添加重试按钮事件
      document.getElementById('retryBtn').addEventListener('click', function() {
        document.getElementById('refreshBtn').click();
      });
      return;
    }
    
    // 如果网站在白名单中
    if (isWhitelisted) {
      resultsDiv.innerHTML = `
        <div class="whitelist-notice">
          <div class="whitelist-icon">✓</div>
          <div class="whitelist-message">
            <h4>当前网站在白名单中</h4>
            <p>已跳过指纹识别</p>
          </div>
        </div>
      `;
      return;
    }
    
    // 如果没有匹配到任何指纹 - 改进的提示
    if (!matches || matches.length === 0) {
      resultsDiv.innerHTML = `
        <div class="no-match-notice">
          <div class="no-match-icon">🔍</div>
          <div class="no-match-message">
            <h4>未识别出来</h4>
            <p>当前网站未匹配到任何已知的CMS或框架特征</p>
            <div class="no-match-suggestions">
              <p>可能的原因：</p>
              <ul>
                <li>网站使用了自定义或较新的技术栈</li>
                <li>网站采用了特殊的防护措施</li>
                <li>指纹库中暂未收录此类型</li>
              </ul>
              <button id="addCustomBtn" class="btn btn-secondary" style="margin-top: 10px;">
                添加自定义指纹
              </button>
            </div>
          </div>
        </div>
      `;
      
      // 添加跳转到添加指纹页面的事件
      document.getElementById('addCustomBtn').addEventListener('click', function() {
        // 切换到添加指纹标签页
        document.querySelector('[data-tab="add"]').click();
      });
      return;
    }
    
    // 显示匹配结果
    let html = `<div class="results-header">
      <h4>识别结果 (${matches.length}个匹配)</h4>
    </div>`;
    
    matches.forEach((match, index) => {
      const importantClass = match.isImportant ? 'important' : '';
      html += `
        <div class="result-item ${importantClass}" style="animation-delay: ${index * 0.1}s">
          <div class="result-cms">
            ${match.cms}
            <span class="type-label">${match.type}</span>
            ${match.isImportant ? '<span class="important-badge">重要</span>' : ''}
          </div>
          <div class="result-detail">
            匹配方式: ${getMethodName(match.method)} / 位置: ${getLocationName(match.location)}
          </div>
        </div>
      `;
    });
    
    resultsDiv.innerHTML = html;
  }
  
  // 获取匹配方式的中文名称
  function getMethodName(method) {
    const methods = {
      'keyword': '关键词',
      'icon_hash': 'Favicon哈希',
      'faviconhash': 'Favicon哈希'
    };
    return methods[method] || method;
  }
  
  // 获取匹配位置的中文名称
  function getLocationName(location) {
    const locations = {
      'body': '页面内容',
      'title': '页面标题',
      'header': 'HTTP头'
    };
    return locations[location] || location;
  }
});