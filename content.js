// 加载特征库
let fingerprints = null;
var MurmurHash3={mul32:function(m,n){var nlo=n&0xffff;var nhi=n-nlo;return((nhi*m|0)+(nlo*m|0))|0;},hashBytes:function(data,len,seed){var c1=0xcc9e2d51,c2=0x1b873593;var h1=seed;var roundedEnd=len&~0x3;for(var i=0;i<roundedEnd;i+=4){var k1=(data.charCodeAt(i)&0xff)|((data.charCodeAt(i+1)&0xff)<<8)|((data.charCodeAt(i+2)&0xff)<<16)|((data.charCodeAt(i+3)&0xff)<<24);k1=this.mul32(k1,c1);k1=((k1&0x1ffff)<<15)|(k1>>>17);k1=this.mul32(k1,c2);h1^=k1;h1=((h1&0x7ffff)<<13)|(h1>>>19);h1=(h1*5+0xe6546b64)|0;}k1=0;switch(len%4){case 3:k1=(data.charCodeAt(roundedEnd+2)&0xff)<<16;case 2:k1|=(data.charCodeAt(roundedEnd+1)&0xff)<<8;case 1:k1|=(data.charCodeAt(roundedEnd)&0xff);k1=this.mul32(k1,c1);k1=((k1&0x1ffff)<<15)|(k1>>>17);k1=this.mul32(k1,c2);h1^=k1;}h1^=len;h1^=h1>>>16;h1=this.mul32(h1,0x85ebca6b);h1^=h1>>>13;h1=this.mul32(h1,0xc2b2ae35);h1^=h1>>>16;return h1;},};if(typeof module!=="undefined"&&typeof module.exports!=="undefined"){module.exports=MurmurHash3;}

// 使用chrome.runtime.getURL获取扩展资源
Promise.all([
  fetch(chrome.runtime.getURL('finger.json')).then(response => {
    if (!response.ok) {
      throw new Error(`未找到finger文件 (状态码: ${response.status})`);
    }
    return response.json();
  }),
  new Promise(resolve => chrome.storage.local.get(['customFingerprints', 'whitelist'], resolve))
])
.then(([data, storageData]) => {
  // 检查finger.json数据格式
  if (!data || !data.fingerprint || !Array.isArray(data.fingerprint)) {
    throw new Error('finger文件格式错误：缺少fingerprint数组');
  }
  
  // 合并内置指纹和自定义指纹
  fingerprints = data.fingerprint;
  
  if (storageData.customFingerprints && storageData.customFingerprints.length > 0) {
    fingerprints = fingerprints.concat(storageData.customFingerprints);
  }
  
  // 检查当前网站是否在白名单中
  const currentHost = window.location.hostname;
  const whitelist = storageData.whitelist || [];
  
  if (isInWhitelist(currentHost, whitelist)) {
    console.log('当前网站在白名单中，跳过指纹识别');
    chrome.storage.local.set({matches: [], isWhitelisted: true, error: null});
  } else {
    checkWebsite(fingerprints);
  }
})
.catch(error => {
  console.error('加载指纹库失败:', error);
  const errorMessage = error.message.includes('未找到finger文件') ? 
    '未找到finger文件，请检查扩展文件是否完整' : 
    `指纹库加载失败: ${error.message}`;
  
  // 将错误信息保存到storage，供popup显示
  chrome.storage.local.set({
    matches: [], 
    isWhitelisted: false,
    error: errorMessage
  });
});

// 检查域名是否在白名单中
function isInWhitelist(hostname, whitelist) {
  if (!whitelist || whitelist.length === 0) return false;
  
  // 移除www前缀进行比较
  const normalizedHost = hostname.replace(/^www\./, '');
  
  return whitelist.some(item => {
    const whitelistDomain = item.url.replace(/^www\./, '');
    return normalizedHost === whitelistDomain || 
           normalizedHost.endsWith('.' + whitelistDomain);
  });
}

// 添加缓存对象
let faviconHashCache = null;

async function checkWebsite(fingerprints) {
  const matches = [];
  const pageContent = document.documentElement.innerHTML;
  const pageTitle = document.title;
  
  // 获取所有需要进行favicon匹配的指纹
  const faviconFingerprints = fingerprints.filter(fp => 
    fp.method === 'icon_hash' || fp.method === 'faviconhash'
  );
  
  // 只有在有favicon匹配需求时才获取favicon hash
  let faviconHash = null;
  if (faviconFingerprints.length > 0) {
    faviconHash = await getFaviconHash();
  }

  for (const fp of fingerprints) {
    let isMatch = false;

    if (fp.method === 'keyword') {
      if (fp.location === 'title') {
        isMatch = fp.keyword.some(kw => pageTitle.includes(kw));
      } else if (fp.location === 'body') {
        isMatch = fp.keyword.every(kw => pageContent.includes(kw));
      }
    } else if ((fp.method === 'icon_hash' || fp.method === 'faviconhash') && faviconHash) {
      isMatch = fp.keyword.includes(faviconHash);
    }

    if (isMatch) {
      matches.push({
        cms: fp.cms,
        type: fp.type || '其他',
        method: fp.method,
        location: fp.location,
        isImportant: fp.isImportant || false
      });
    }
  }

  chrome.storage.local.set({matches: matches, error: null});
  return matches;
}

async function getFaviconHash() {
  // 如果已经有缓存的哈希值，直接返回
  if (faviconHashCache !== null) {
    return faviconHashCache;
  }

  try {
    // 获取favicon的URL
    let faviconUrl = '';
    const faviconElement = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
    
    if (faviconElement) {
      faviconUrl = faviconElement.href;
    } else {
      faviconUrl = new URL('/favicon.ico', window.location.origin).href;
    }
    
    // 检查URL是否有效
    if (!faviconUrl) {
      console.log('未找到有效的favicon URL');
      return null;
    }

    // 获取favicon的内容
    const response = await fetch(faviconUrl);
    if (!response.ok) {
      console.log('获取favicon失败:', response.status);
      return null;
    }

    const blob = await response.blob();
    if (blob.size === 0) {
      console.log('favicon内容为空');
      return null;
    }

    // 计算hash
    const hash = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const base64String = e.target.result.split(',')[1];
          const formattedBase64 = base64String.replace(/.{76}/g, '$&\n') + '\n';
          const hash = MurmurHash3.hashBytes(formattedBase64, formattedBase64.length, 0);
          resolve(hash.toString());
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // 缓存计算结果
    faviconHashCache = hash;
    return hash;

  } catch (error) {
    console.error('获取favicon hash失败:', error);
    return null;
  }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.type === 'GET_MATCHES') {
    chrome.storage.local.get(['matches', 'isWhitelisted', 'error'], function(result) {
      sendResponse({
        matches: result.matches || [],
        isWhitelisted: result.isWhitelisted || false,
        error: result.error || null
      });
    });
    return true;
  } else if (request.type === 'SCAN_PAGE') {
    // 检查当前网站是否在白名单中
    const currentHost = window.location.hostname;
    chrome.storage.local.get(['whitelist'], function(result) {
      const whitelist = result.whitelist || [];
      
      if (isInWhitelist(currentHost, whitelist)) {
        console.log('当前网站在白名单中，跳过指纹识别');
        chrome.storage.local.set({matches: [], isWhitelisted: true, error: null});
        sendResponse({matches: [], isWhitelisted: true, error: null});
      } else {
        // 重新扫描页面
        if (fingerprints) {
          checkWebsite(fingerprints).then(matches => {
            sendResponse({matches: matches, isWhitelisted: false, error: null});
          });
        } else {
          // 如果指纹库尚未加载，重新加载
          Promise.all([
            fetch(chrome.runtime.getURL('finger.json')).then(response => {
              if (!response.ok) {
                throw new Error(`未找到finger文件 (状态码: ${response.status})`);
              }
              return response.json();
            }),
            new Promise(resolve => chrome.storage.local.get(['customFingerprints'], resolve))
          ])
          .then(([data, customData]) => {
            if (!data || !data.fingerprint || !Array.isArray(data.fingerprint)) {
              throw new Error('finger文件格式错误：缺少fingerprint数组');
            }
            
            fingerprints = data.fingerprint;
            
            if (customData.customFingerprints && customData.customFingerprints.length > 0) {
              fingerprints = fingerprints.concat(customData.customFingerprints);
            }
            
            return checkWebsite(fingerprints);
          })
          .then(matches => {
            sendResponse({matches: matches, isWhitelisted: false, error: null});
          })
          .catch(error => {
            console.error('重新加载指纹库失败:', error);
            const errorMessage = error.message.includes('未找到finger文件') ? 
              '未找到finger文件，请检查扩展文件是否完整' : 
              `指纹库加载失败: ${error.message}`;
            
            chrome.storage.local.set({matches: [], error: errorMessage});
            sendResponse({matches: [], isWhitelisted: false, error: errorMessage});
          });
          
          return true;
        }
      }
    });
    return true;
  }
});