AFRAME.registerComponent('gif-shader', {
  schema: {
    src: { default: '' },
    speed: { default: 1 },
    play: { default: true },
  },
  init() {
    // 初始化各种属性
    this.frameIdx = 0;
    this.frameCnt = 0;
    this.delayTimes = [];
    this.frames = [];
    this.rawFrameTimes = [];
    this.rawFrames = [];
    this.loopCnt = 0;
    this.lastFrameTime = 0;
    this.frameSkip = 1;

    // 创建canvas元素
    this.cnv = document.createElement('canvas');
    this.ctx = this.cnv.getContext('2d');
  },
  update(oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);
    console.log(diff)
    if (diff.hasOwnProperty('src')) {
      // 加载并解析 GIF
      this.loadGIF(this.data.src, this.onGIFLoaded.bind(this), this.onGIFLoadError.bind(this));
    }
    else if (diff.hasOwnProperty('speed')) {
      // 更新速度
      let speed = this.data.speed;
      this.delayTimes = this.rawFrameTimes.map(time => time / speed);
    }
  },
  // setupTexture() {
  //   this.texture = new THREE.Texture(this.cnv);
  //   this.texture.minFilter = THREE.LinearFilter;
  //   this.texture.magFilter = THREE.LinearFilter;
  //   this.el.object3D.material = new THREE.MeshBasicMaterial({
  //     map: this.texture,
  //     transparent: true,
  //     alphaTest: 0.5
  //   });
  // },
  onGIFLoaded(times, cnt, frames) {
    this.rawFrameTimes = times;
    this.rawFrames = frames;

    let speed = this.data.speed;
    if (speed < 1) speed = 1;
    this.delayTimes = this.rawFrameTimes.map(time => time / speed);
    this.frames = this.rawFrames;

    this.loopCnt = cnt ? cnt : 0;
    this.frameCnt = times.length;
    this.cnv.width = frames[0].width;
    this.cnv.height = frames[0].height;

    // 初始化纹理
    this.texture = new THREE.Texture(this.cnv);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.el.getObject3D('mesh').material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.5
    });
  },
  onGIFLoadError(err) {
    console.log(err);
  },
  loadGIF(url, successCB, errorCB) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url); // 以GET方式请求GIF的URL
    xhr.responseType = 'arraybuffer'; // 设置响应类型为arraybuffer，以便处理二进制数据
    xhr.onload = function (e) {
      // 加载成功后，将响应的二进制数据转换为Uint8Array，并调用parseGIF函数进行解析
      this.parseGIF(new Uint8Array(e.target.response), successCB, errorCB);
    }.bind(this);
    xhr.onerror = function () {
      // 加载失败时调用错误回调函数
      errorCB && errorCB('loadGIF: load error');
    };
    xhr.send(); // 发送请求
  },
  parseGIF(gif, successCB, errorCB) {
    var pos = 0; // 初始化位置指针
    var delayTimes = []; // 用于存储每帧的延迟时间
    var loadCnt = 0; // 已加载的帧数计数器
    var graphicControl = null; // 图形控制扩展块
    var imageData = null; // 图像数据块
    var frames = []; // 存储帧的数组
    var loopCnt = 0; // 循环次数
    // 检查GIF头部信息是否正确
    if (gif[0] === 0x47 && gif[1] === 0x49 && gif[2] === 0x46 && // 'GIF'
      gif[3] === 0x38 && gif[4] === 0x39 && gif[5] === 0x61) { // '89a'
      // 跳过GIF逻辑屏幕描述符和可能的全局颜色表
      pos += 13 + (+!!(gif[10] & 0x80) * Math.pow(2, (gif[10] & 0x07) + 1) * 3);
      var gifHeader = gif.subarray(0, pos); // 获取GIF头部数据
      // 循环处理GIF的各个数据块
      while (gif[pos] && gif[pos] !== 0x3b) {
        var offset = pos, blockId = gif[pos]; // 记录当前块的位置和标识符
        if (blockId === 0x21) { // 扩展块
          var label = gif[++pos]; // 获取扩展块的标签
          // 处理图形控制扩展、注释扩展、应用程序扩展和纯文本扩展
          if ([0x01, 0xfe, 0xf9, 0xff].indexOf(label) !== -1) {
            // 如果是图形控制扩展，记录延迟时间和循环次数
            label === 0xf9 && (delayTimes.push((gif[pos + 3] + (gif[pos + 4] << 8)) * 10));
            label === 0xff && (loopCnt = gif[pos + 15] + (gif[pos + 16] << 8));
            // 跳过扩展块的数据部分
            while (gif[++pos]) pos += gif[pos];
            // 记录图形控制扩展的数据
            label === 0xf9 && (graphicControl = gif.subarray(offset, pos + 1));
          } else { // 未知的扩展标签
            errorCB && errorCB('parseGIF: unknown label'); break;
          }
        } else if (blockId === 0x2c) { // 图像描述符
          // 跳过图像描述符和局部颜色表
          pos += 9;
          pos += 1 + (+!!(gif[pos] & 0x80) * (Math.pow(2, (gif[pos] & 0x07) + 1) * 3));
          // 跳过图像数据
          while (gif[++pos]) pos += gif[pos];
          // 记录图像数据块
          var imageData = gif.subarray(offset, pos + 1);

          // 将处理好的帧数据存储起来
          const blob = new Blob([gifHeader, graphicControl, imageData]);
          const url = URL.createObjectURL(blob);
          frames.push(url);
        } else { // 未知的数据块标识符
          errorCB && errorCB('parseGIF: unknown blockId'); break;
        }
        pos++;
      }
    } else { // 不是有效的GIF89a文件
      errorCB && errorCB('parseGIF: no GIF89a');
    }
    
    // 如果成功解析出帧数据
    if (frames.length) {
      var cnv = document.createElement('canvas');
      var ctx = cnv.getContext('2d');
      var loadImg = function () {
        // 设置画布大小
        cnv.width = frames[0].width || 2;
        cnv.height = frames[0].height || 2;
        // 加载并绘制每一帧
        frames.forEach(function (src, i) {
          var img = new Image();
          img.onload = function (e, i) {
            loadCnt++;
            frames[i] = this;
            // 当所有帧都加载完成时，进行下一步处理
            if (loadCnt === frames.length) {
              loadCnt = 0;
              imageFix(1);
            }
          }.bind(img, null, i);
          img.src = src;
        });
      }
      var imageFix = function (i) {
        var img = new Image();
        img.onload = function (e, i) {
          loadCnt++;
          frames[i] = this;
          // 当所有帧都处理完成时，清理资源并调用成功回调函数
          if (loadCnt === frames.length) {
            ctx = null, cnv = null;
            successCB && successCB(delayTimes, loopCnt, frames);
          } else {
            // 继续处理下一帧
            imageFix(++i);
          }
        }.bind(img);
        img.src = cnv.toDataURL('image/gif');
      }
      loadImg(); // 开始加载和处理帧
    }
  },
  updateFrame() {
    let img = this.frames[this.frameIdx];
    if (!img) { return }

    this.frameSkip = this.data.play ? 1 : 0;

    this.ctx.drawImage(img, 0, 0);
    this.texture.needsUpdate = true;

    this.frameIdx = (this.frameIdx + this.frameSkip) % this.frames.length;
  },
  tick(time) {
    if (!this.delayTimes || time - this.lastFrameTime < this.delayTimes[this.frameIdx]) { return }
    this.updateFrame();
    this.lastFrameTime = time;
  }
});