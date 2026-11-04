let QRCode;

(function () {
  let wholeExtension;
  const QRMath = {
    glog: function (idx) {
      let n = idx;
      if (n < 1) {
        throw new Error(`glog(${n}) argument must be greater than 0`);
      }
      return QRMath.LOG_TABLE[n];
    },
    gexp: function (idx) {
      let n = idx;
      while (n < 0) {
        n += 255;
      }
      while (n >= 256) {
        n -= 255;
      }
      return QRMath.EXP_TABLE[n];
    },
    EXP_TABLE: new Array(256), LOG_TABLE: new Array(256)
  };
  const QRMaskPattern = {
    PATTERN000: 0,
    PATTERN001: 1,
    PATTERN010: 2,
    PATTERN011: 3,
    PATTERN100: 4,
    PATTERN101: 5,
    PATTERN110: 6,
    PATTERN111: 7
  };
  const QR_CODE_Util = {
    PATTERN_POSITION_TABLE: [],
    G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18: (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
    getBCHTypeInfo: function (data) {
      let d = data << 10;
      while (QR_CODE_Util.getBCHDigit(d) - QR_CODE_Util.getBCHDigit(QR_CODE_Util.G15) >= 0) {
        d ^= (QR_CODE_Util.G15 << (QR_CODE_Util.getBCHDigit(d) - QR_CODE_Util.getBCHDigit(QR_CODE_Util.G15)));
      }
      return ((data << 10) | d) ^ QR_CODE_Util.G15_MASK;
    },
    getBCHTypeNumber: function (data) {
      let d = data << 12;
      while (QR_CODE_Util.getBCHDigit(d) - QR_CODE_Util.getBCHDigit(QR_CODE_Util.G18) >= 0) {
        d ^= (QR_CODE_Util.G18 << (QR_CODE_Util.getBCHDigit(d) - QR_CODE_Util.getBCHDigit(QR_CODE_Util.G18)));
      }
      return (data << 12) | d;
    },
    getBCHDigit: function (data) {
      let digit = 0;
      while (data !== 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    },
    getPatternPosition: function (typeNumber) {
      return QR_CODE_Util.PATTERN_POSITION_TABLE[typeNumber - 1];
    },
    getMask: function (maskPattern, positionX, positionY) {
      const MASK_PATTERNS = [
        // PATTERN000
        (i, j) => (i + j) % 2 === 0,
        // PATTERN001
        (i, j) => i % 2 === 0,
        // PATTERN010
        (i, j) => j % 3 === 0,
        // PATTERN011
        (i, j) => (i + j) % 3 === 0,
        // PATTERN100
        (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
        // PATTERN101
        (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
        // PATTERN110
        (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
        // PATTERN111
        (i, j) => (((i * j) % 3) + (i + j) % 2) % 2 === 0
      ];
      const handler = MASK_PATTERNS[maskPattern];
      if (typeof handler !== 'function') {
        throw new Error(`Invalid maskPattern: ${maskPattern}. Expected one of ${Object.values(QRMaskPattern).join(', ')}`);
      }

      return handler(positionX, positionY);
    },
    getErrorCorrectPolynomial: function (errorCorrectLength) {
      let a = new QRPolynomial([1], 0);
      for (let index = 0; index < errorCorrectLength; index++) {
        a = a.multiply(new QRPolynomial([1, QRMath.gexp(index)], 0));
      }
      return a;
    },
    getLengthInBits: function (mode, type) {
      if (type < 1 || type > 40) {
        throw new Error(`Invalid type: ${type}`);
      }

      const modeMap = {
        [QRMode.MODE_NUMBER]: [10, 12, 14],
        [QRMode.MODE_ALPHA_NUM]: [9, 11, 13],
        [QRMode.MODE_8BIT_BYTE]: [8, 16, 16],
        [QRMode.MODE_KANJI]: [8, 10, 12]
      };

      const index = type <= 9 ? 0 : (type <= 26 ? 1 : 2);

      if (!modeMap[mode]) {
        throw new Error(`Invalid mode: ${mode}`);
      }

      return modeMap[mode][index];
    },
    getLostPoint: function (qrCode) {
      const moduleCount = qrCode.getModuleCount();
      let lostPoint = 0;
      const WEIGHT_SEQUENCE_PATTERN = 40;

      function isValidCell(row, col) {
        return row >= 0 && col >= 0 && row < moduleCount && col < moduleCount;
      }

      const neighbors = [
        { dr: -1, dc: -1 },
        { dr: -1, dc: 0 },
        { dr: -1, dc: 1 },
        { dr: 0, dc: -1 },
        { dr: 0, dc: 1 },
        { dr: 1, dc: -1 },
        { dr: 1, dc: 0 },
        { dr: 1, dc: 1 }
      ];

      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          const center = qrCode.isDark(row, col);
          let sameCount = 0;

          for (const neighbor of neighbors) {
            const { dr, dc } = neighbor;
            const newRow = row + dr;
            const newCol = col + dc;
            if (!isValidCell(newRow, newCol)) {
              continue;
            }

            if (qrCode.isDark(newRow, newCol) === center) {
              sameCount++;
            }
          }

          if (sameCount > 5) {
            lostPoint += 3 + (sameCount - 5);
          }
        }
      }

      for (let row = 0; row < moduleCount - 1; row++) {
        for (let col = 0; col < moduleCount - 1; col++) {
          const a = qrCode.isDark(row, col);
          const b = qrCode.isDark(row + 1, col);
          const c = qrCode.isDark(row, col + 1);
          const d = qrCode.isDark(row + 1, col + 1);
          const count = a + b + c + d;
          if (count === 0 || count === 4) {
            lostPoint += 3;
          }
        }
      }

      function detectPattern(row, col, isHorizontal) {
        let offset = isHorizontal ? 0 : 1;
        let step = isHorizontal ? 1 : 0;

        return (
          qrCode.isDark(row, col) &&
          !qrCode.isDark(row + offset, col + step) &&
          qrCode.isDark(row + (2 * offset), col + (2 * step)) &&
          qrCode.isDark(row + (3 * offset), col + (3 * step)) &&
          qrCode.isDark(row + (4 * offset), col + (4 * step)) &&
          !qrCode.isDark(row + (5 * offset), col + (5 * step)) &&
          qrCode.isDark(row + (6 * offset), col + (6 * step))
        );
      }

      // 检测伪定位图案模式
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount - 6; col++) {
          if (detectPattern(row, col, true)) {
            lostPoint += WEIGHT_SEQUENCE_PATTERN;
          }
        }
      }

      // 垂直检测伪定位图案模式
      for (let col = 0; col < moduleCount; col++) {
        for (let row = 0; row < moduleCount - 6; row++) {
          if (detectPattern(row, col, false)) {
            lostPoint += WEIGHT_SEQUENCE_PATTERN;
          }
        }
      }

      // 计算暗色模块的数量
      let darkCount = 0;
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qrCode.isDark(row, col)) {
            darkCount += 1;
          }
        }
      }

      const ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    }
  };

  function QR8bitByte(data) {
    this.mode = QRMode.MODE_8BIT_BYTE;
    this.data = data;
    this.parsedData = [];

    for (let i = 0, l = this.data.length; i < l; i++) {
      let byteArr = [];
      const code = this.data.charCodeAt(i);

      if (code > 0x10000) {
        byteArr[0] = 0xF0 | ((code & 0x1C0000) >>> 18);
        byteArr[1] = 0x80 | ((code & 0x3F000) >>> 12);
        byteArr[2] = 0x80 | ((code & 0xFC0) >>> 6);
        byteArr[3] = 0x80 | (code & 0x3F);
      } else if (code > 0x800) {
        byteArr[0] = 0xE0 | ((code & 0xF000) >>> 12);
        byteArr[1] = 0x80 | ((code & 0xFC0) >>> 6);
        byteArr[2] = 0x80 | (code & 0x3F);
      } else if (code > 0x80) {
        byteArr[0] = 0xC0 | ((code & 0x7C0) >>> 6);
        byteArr[1] = 0x80 | (code & 0x3F);
      } else {
        byteArr[0] = code;
      }

      this.parsedData.push(byteArr);
    }

    this.parsedData = Array.prototype.concat.apply([], this.parsedData);

    if (this.parsedData.length !== this.data.length) {
      this.parsedData.unshift(191);
      this.parsedData.unshift(187);
      this.parsedData.unshift(239);
    }
  }

  QR8bitByte.prototype = {
    getLength: function () {
      return this.parsedData.length;
    },
    write: function (buffer) {
      this.parsedData.forEach(byte => buffer.put(byte, 8));
    }
  };

  function QRCodeModel(typeNumber, errorCorrectLevel, moduleCount = 0, dataList = []) {
    this.typeNumber = typeNumber;
    this.errorCorrectLevel = errorCorrectLevel;
    this.modules = null;
    this.moduleCount = moduleCount;
    this.dataCache = null;
    this.dataList = dataList;
  }

  QRCodeModel.prototype = {
    addData: function (data) {
      const qr8bitByte = new QR8bitByte(data);
      this.dataList.push(qr8bitByte);
      this.dataCache = null;
    },
    isDark: function (row, col) {
      if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
        throw new Error(`Invalid position: row ${row}, col ${col}`);
      }
      return this.modules[row][col];
    },
    getModuleCount: function () {
      return this.moduleCount;
    },
    make: function () {
      this.makeImpl(false, this.getBestMaskPattern());
    },
    makeImpl: function (test, maskPattern) {
      const MODULE_COUNT_MULTIPLIER = 4;
      const MODULE_COUNT_BASE = 17;
      const PROBE_PATTERN_OFFSET_X = 0;
      const PROBE_PATTERN_OFFSET_Y = 0;
      const PROBE_PATTERN_MIDDLE_OFFSET = 7;
      const MIN_TYPE_FOR_SETUP_TYPE_NUMBER = 7;

      this.moduleCount = this.typeNumber * MODULE_COUNT_MULTIPLIER + MODULE_COUNT_BASE;
      this.modules = new Array(this.moduleCount);
      for (let rowNum = 0; rowNum < this.moduleCount; rowNum++) {
        this.modules[rowNum] = new Array(this.moduleCount);
        for (let col = 0; col < this.moduleCount; col++) {
          this.modules[rowNum][col] = null;
        }
      }
      // 设置 3 个定位图案（探针图案）位置
      this.setupPositionProbePattern(PROBE_PATTERN_OFFSET_X, PROBE_PATTERN_OFFSET_Y);
      this.setupPositionProbePattern(this.moduleCount - PROBE_PATTERN_MIDDLE_OFFSET, PROBE_PATTERN_OFFSET_Y);
      this.setupPositionProbePattern(PROBE_PATTERN_OFFSET_X, this.moduleCount - PROBE_PATTERN_MIDDLE_OFFSET);

      // 调整图案
      this.setupPositionAdjustPattern();
      // 定时图案
      this.setupTimingPattern();
      // 类型信息设置
      this.setupTypeInfo(test, maskPattern);
      if (this.typeNumber >= MIN_TYPE_FOR_SETUP_TYPE_NUMBER) {
        this.setupTypeNumber(test);
      }
      if (this.dataCache == null) {
        this.dataCache = QRCodeModel.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
      }
      this.mapData(this.dataCache, maskPattern);
    },
    setupPositionProbePattern: function (row, col) {
      const moduleCount = this.moduleCount;
      const modules = this.modules;

      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          if (row + r < 0 || row + r >= moduleCount || col + c < 0 || col + c >= moduleCount) {
            continue;
          }

          const isEdge = (0 <= r && r <= 6) && (c === 0 || c === 6);
          const isOtherEdge = (0 <= c && c <= 6) && (r === 0 || r === 6);
          const isCenter = (2 <= r && r <= 4) && (2 <= c && c <= 4);
          modules[row + r][col + c] = isEdge || isOtherEdge || isCenter;
        }
      }
    },

    getBestMaskPattern: function () {
      let minLostPoint = 0;
      let pattern = 0;
      for (let i = 0; i < 8; i++) {
        this.makeImpl(true, i);
        const lostPoint = QR_CODE_Util.getLostPoint(this);
        if (i === 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }
      return pattern;
    },
    setupTimingPattern: function () {
      for (let r = 8; r < this.moduleCount - 8; r++) {
        if (this.modules[r][6] != null) {
          continue;
        }
        this.modules[r][6] = (r % 2 === 0);
      }
      for (let c = 8; c < this.moduleCount - 8; c++) {
        if (this.modules[6][c] != null) {
          continue;
        }
        this.modules[6][c] = (c % 2 === 0);
      }
    },
    setupPositionAdjustPattern: function () {
      if (wholeExtension.PATTERN_POSITION_TABLE) {
        QR_CODE_Util.PATTERN_POSITION_TABLE = wholeExtension.PATTERN_POSITION_TABLE;
      }
      const pos = QR_CODE_Util.getPatternPosition(this.typeNumber);
      const modules = this.modules;
      const n = pos.length;

      for (let i = 0; i < n; i++) {
        const row = pos[i];
        for (let j = 0; j < n; j++) {
          const col = pos[j];
          if (row < 0 || col < 0 || row >= modules.length || col >= modules[row].length) {
            continue;
          }
          if (modules[row][col] != null) {
            continue;
          }
          this.applyPattern(modules, row, col);
        }
      }
    },
    applyPattern: function (modules, row, col) {
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          modules[row + r][col + c] = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
        }
      }
    },
    setupTypeNumber: function (test) {
      let module;
      const bits = QR_CODE_Util.getBCHTypeNumber(this.typeNumber);
      for (let i = 0; i < 18; i++) {
        module = (!test && ((bits >> i) & 1) === 1);
        this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = module;
      }
      for (let i = 0; i < 18; i++) {
        module = (!test && ((bits >> i) & 1) === 1);
        this.modules[i % 3 + this.moduleCount - 8 - 3][Math.floor(i / 3)] = module;
      }
    },
    setupTypeInfo: function (test, maskPattern) {
      let module;
      const data = (this.errorCorrectLevel << 3) | maskPattern;
      const bits = QR_CODE_Util.getBCHTypeInfo(data);
      for (let i = 0; i < 15; i++) {
        module = (!test && ((bits >> i) & 1) === 1);
        if (i < 6) {
          this.modules[i][8] = module;
        } else if (i < 8) {
          this.modules[i + 1][8] = module;
        } else {
          this.modules[this.moduleCount - 15 + i][8] = module;
        }
      }
      for (let i = 0; i < 15; i++) {
        module = (!test && ((bits >> i) & 1) === 1);
        if (i < 8) {
          this.modules[8][this.moduleCount - i - 1] = module;
        } else if (i < 9) {
          this.modules[8][15 - i - 1 + 1] = module;
        } else {
          this.modules[8][15 - i - 1] = module;
        }
      }
      this.modules[this.moduleCount - 8][8] = (!test);
    },
    mapData: function (data, maskPattern) {
      let inc = -1;
      let row = this.moduleCount - 1;
      let bitIndex = 7;
      let byteIndex = 0;

      for (let col = this.moduleCount - 1; col > 0; col -= 2) {
        if (col === 6) {
          col--;
        }

        while (true) {
          const leftCol = col;
          if (this.modules[row][leftCol] === null) {
            let dark = false;

            if (byteIndex < data.length) {
              dark = Boolean((data[byteIndex] >>> bitIndex) & 1);
            }

            const mask = QR_CODE_Util.getMask(maskPattern, row, leftCol);
            if (mask) {
              dark = !dark;
            }

            this.modules[row][leftCol] = dark;
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }

          const rightCol = col - 1;
          if (this.modules[row][rightCol] === null) {
            let dark = false;

            if (byteIndex < data.length) {
              dark = Boolean((data[byteIndex] >>> bitIndex) & 1);
            }

            const mask = QR_CODE_Util.getMask(maskPattern, row, rightCol);
            if (mask) {
              dark = !dark;
            }

            this.modules[row][rightCol] = dark;
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }

          row += inc;

          if (row < 0 || row >= this.moduleCount) {
            row = row - inc;
            inc = -inc;
            break;
          }
        }
      }
    }
  };
  // 设置QRCodeModel的PAD0属性为0xEC，用于二维码模型的填充
  QRCodeModel.PAD0 = 0xEC;
  QRCodeModel.PAD1 = 0x11;
  QRCodeModel.createData = function (typeNumber, errorCorrectLevel, dataList) {
    const rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
    const qrBitBuffer = new QRBitBuffer();
    let totalDataCount = 0;
    for (const rsBlock of rsBlocks) {
      totalDataCount += rsBlock.dataCount;
    }
    const maxBits = totalDataCount * 8;
    let totalBits = 0;

    for (const data of dataList) {
      qrBitBuffer.put(data.mode, 4);
      const lengthBits = QR_CODE_Util.getLengthInBits(data.mode, typeNumber);
      qrBitBuffer.put(data.getLength(), lengthBits);
      data.write(qrBitBuffer);
      totalBits += lengthBits + data.getLength();
    }

    if (totalBits > maxBits) {
      throw new Error(`code length overflow. (${totalBits} > ${maxBits})`);
    }
    if (totalBits + 4 <= maxBits) {
      qrBitBuffer.put(0, 4);
      totalBits += 4;
    }

    while (totalBits % 8 !== 0) {
      qrBitBuffer.putBit(false);
      totalBits++;
    }

    while (totalBits < maxBits) {
      qrBitBuffer.put(QRCodeModel.PAD0, 8);
      totalBits += 8;
      if (totalBits >= maxBits) {
        break;
      }
      qrBitBuffer.put(QRCodeModel.PAD1, 8);
      totalBits += 8;
    }
    return QRCodeModel.createBytes(qrBitBuffer, rsBlocks);
  };
  QRCodeModel.createBytes = function (buffer, rsBlocks) {
    let offset = 0;
    let maxDcCount = 0;
    let maxEcCount = 0;
    const dcData = new Array(rsBlocks.length);
    const ecData = new Array(rsBlocks.length);
    for (let r = 0; r < rsBlocks.length; r++) {
      const dcCount = rsBlocks[r].dataCount;
      const ecCount = rsBlocks[r].totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcData[r] = new Array(dcCount);
      for (let i = 0; i < dcData[r].length; i++) {
        dcData[r][i] = 0xff & buffer.buffer[i + offset];
      }
      offset += dcCount;
      const rsPoly = QR_CODE_Util.getErrorCorrectPolynomial(ecCount);
      const rawPoly = new QRPolynomial(dcData[r], rsPoly.getLength() - 1);
      const modPoly = rawPoly.mod(rsPoly);
      ecData[r] = new Array(rsPoly.getLength() - 1);
      for (let i = 0; i < ecData[r].length; i++) {
        const modIndex = i + modPoly.getLength() - ecData[r].length;
        ecData[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
      }
    }
    let totalCodeCount = 0;
    rsBlocks.forEach(rsBlock => {
      totalCodeCount += rsBlock.totalCount;
    });
    const data = new Array(totalCodeCount);
    let index = 0;
    for (let i = 0; i < maxDcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        const currentDcData = dcData[r];
        if (i < currentDcData.length) {
          data[index] = currentDcData[i];
          index++;
        }
      }
    }
    for (let i = 0; i < maxEcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < ecData[r].length) {
          data[index++] = ecData[r][i];
        }
      }
    }
    return data;
  };
  let QRMode = { MODE_NUMBER: 1 << 0, MODE_ALPHA_NUM: 1 << 1, MODE_8BIT_BYTE: 1 << 2, MODE_KANJI: 1 << 3 };
  const QRErrorCorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };

  for (let index = 0; index < 8; index++) {
    QRMath.EXP_TABLE[index] = 1 << index;
  }
  for (let index = 8; index < 256; index++) {
    QRMath.EXP_TABLE[index] = QRMath.EXP_TABLE[index - 4] ^ QRMath.EXP_TABLE[index - 5] ^ QRMath.EXP_TABLE[index - 6] ^ QRMath.EXP_TABLE[index - 8];
  }
  for (let index = 0; index < 255; index++) {
    QRMath.LOG_TABLE[QRMath.EXP_TABLE[index]] = index;
  }

  function QRPolynomial(num, shift) {
    const numLength = num.length;
    if (numLength === undefined) {
      throw new Error(`Invalid input: ${numLength}/${shift}`);
    }
    let offset = 0;
    while (offset < numLength && num[offset] === 0) {
      offset++;
    }
    this.num = new Array(numLength - offset + shift);
    for (let i = 0; i < numLength - offset; i++) {
      this.num[i] = num[i + offset];
    }
  }

  QRPolynomial.prototype = {
    get: function (index) {
      return this.num[index];
    },
    getLength: function () {
      return this.num.length;
    },
    multiply: function (e) {
      const num = new Array(this.getLength() + e.getLength() - 1);
      for (let i = 0; i < this.getLength(); i++) {
        for (let j = 0; j < e.getLength(); j++) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
        }
      }
      return new QRPolynomial(num, 0);
    },
    mod: function (divisor) {
      if (this.getLength() - divisor.getLength() < 0) {
        return this;
      }
      const ratio = QRMath.glog(this.get(0)) - QRMath.glog(divisor.get(0));
      const num = new Array(this.getLength());
      for (let i = 0; i < this.getLength(); i++) {
        num[i] = this.get(i);
      }
      for (let i = 0; i < divisor.getLength(); i++) {
        num[i] ^= QRMath.gexp(QRMath.glog(divisor.get(i)) + ratio);
      }
      return new QRPolynomial(num, 0).mod(divisor);
    }
  };

  /**
   * QRRSBlock 类用于表示一个包含总数量和数据数量的块。
   * @class
   * @param {number} totalCount - 总数量，必须是一个非负整数。
   * @param {number} dataCount - 数据数量，必须是一个非负整数且不大于 totalCount。
   */
  function QRRSBlock(totalCount, dataCount) {
    this.totalCount = totalCount;
    this.dataCount = dataCount;
  }

  QRRSBlock.RS_BLOCK_TABLE = wholeExtension?.RS_BLOCK_TABLE || [];
  QRRSBlock.getRSBlocks = function (typeNumber, errorCorrectLevel) {
    QRRSBlock.RS_BLOCK_TABLE = wholeExtension?.RS_BLOCK_TABLE || [];
    const rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
    if (!rsBlock) {
      throw new Error(`bad rs block @ typeNumber: ${typeNumber} / errorCorrectLevel: ${errorCorrectLevel}`);
    }
    const length = rsBlock.length / 3;
    const list = [];
    for (let index = 0; index < length; index++) {
      const count = rsBlock[index * 3];
      const totalCount = rsBlock[index * 3 + 1];
      const dataCount = rsBlock[index * 3 + 2];
      for (let j = 0; j < count; j++) {
        list.push(new QRRSBlock(totalCount, dataCount));
      }
    }
    return list;
  };
  QRRSBlock.getRsBlockTable = function (typeNumber, errorCorrectLevel) {
    const levelMap = {
      [QRErrorCorrectLevel.L]: 0,
      [QRErrorCorrectLevel.M]: 1,
      [QRErrorCorrectLevel.Q]: 2,
      [QRErrorCorrectLevel.H]: 3
    };

    const index = (typeNumber - 1) * 4 + (levelMap[errorCorrectLevel] || -1);
    return index >= 0 ? QRRSBlock.RS_BLOCK_TABLE[index] : undefined;
  };

  /**
   * QRBitBuffer构造函数，用于创建一个二进制缓冲区对象
   * @constructor
   */
  function QRBitBuffer() {
    this.buffer = [];
    this.length = 0;
  }

  QRBitBuffer.prototype = {
    get: function (idx) {
      const bufIndex = Math.floor(idx / 8);
      return ((this.buffer[bufIndex] >>> (7 - idx % 8)) & 1) === 1;
    },
    put: function (num, length) {
      for (let i = 0; i < length; i++) {
        this.putBit(((num >>> (length - i - 1)) & 1) === 1);
      }
    },
    getLengthInBits: function () {
      return this.length;
    },
    putBit: function (bit) {
      const bufferIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= bufferIndex) {
        this.buffer.push(0);
      }
      if (bit) {
        this.buffer[bufferIndex] |= (0x80 >>> (this.length % 8));
      }
      this.length++;
    }
  };
  let QRCodeLimitLength = wholeExtension?.QRCodeLimitLength || [];
  function _isSupportCanvas() {
    return typeof CanvasRenderingContext2D !== "undefined";
  }

  function _getAndroid() {
    const userAgent = navigator.userAgent;
    const androidRegex = /android (\d+\.\d+)/i;
    const match = userAgent.match(androidRegex);

    if (match && match[1]) {
      return parseFloat(match[1]);
    }

    return false;
  }

  const svgDrawer = (function () {

    /**
     * Drawing构造函数，用于创建一个Drawing对象
     * @param {HTMLElement} el - 需要进行绘制的HTML元素
     * @param {Object} htOption - 绘制选项，包含绘制所需的各种参数
     */
    const Drawing = function (el, htOption) {
      this._el = el;
      this._htOption = htOption;
    };

    Drawing.prototype.draw = function (oQRCode) {
      const { _htOption, _el } = this;
      const nCount = oQRCode.getModuleCount();
      if (nCount <= 0) {
        throw new Error("Invalid module count: must be greater than zero");
      }
      const nWidth = Math.floor(_htOption.width / nCount);
      const nHeight = Math.floor(_htOption.height / nCount);

      this.clear();


      /**
       * 创建一个SVG元素
       * @param {string} tag SVG元素的标签名
       * @param {object} attrs SVG元素的属性集合
       * @return {object} 返回创建的SVG元素
       * @throws {Error} 如果属性的键或值不是字符串或者为空字符串，会抛出错误
       */
      function makeSVG(tag, attrs) {
        const svgNS = 'http://www.w3.org/2000/svg';
        const el = document.createElementNS(svgNS, tag);

        for (const [k, v] of Object.entries(attrs)) {
          if (typeof k !== 'string' || k.trim() === '') {
            throw new Error('Invalid attribute key');
          }
          if (typeof v !== 'string' || v.trim() === '') {
            throw new Error('Invalid attribute value');
          }
          el.setAttributeNS(svgNS, k, v);
        }
        return el;
      }

      const svg = makeSVG("svg", {
        viewBox: `0 0 ${nCount} ${nCount}`,
        width: '100%',
        height: '100%',
        fill: _htOption.colorLight
      });
      svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
      _el.appendChild(svg);

      svg.appendChild(makeSVG("rect", { "fill": _htOption.colorLight, "width": "100%", "height": "100%" }));
      svg.appendChild(makeSVG("rect", { "fill": _htOption.colorDark, "width": "1", "height": "1", "id": "template" }));

      for (let row = 0; row < nCount; row++) {
        for (let col = 0; col < nCount; col++) {
          if (oQRCode.isDark(row, col)) {
            const childElement = makeSVG("use", { "x": String(col), "y": String(row) });
            childElement.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#template");
            svg.appendChild(childElement);
          }
        }
      }
    };
    /**
     * 清除Drawing对象中的所有子节点
     * @return {void}
     */
    Drawing.prototype.clear = function () {
      while (this._el.hasChildNodes()) {
        // 移除Drawing对象的最后一个子节点
        this._el.removeChild(this._el.lastChild);
      }
    };
    return Drawing;
  })();

  const useSVG = document.documentElement.tagName.toLowerCase() === "svg";
  let noSVGDrawer = !_isSupportCanvas() ? (function () {
    const Drawing = function (el, htOption) {
      this._el = el;
      this._htOption = htOption;
    };

    Drawing.prototype.draw = function (oQRCode) {
      const { _htOption, _el } = this;
      const nCount = oQRCode.getModuleCount();
      if (nCount <= 0) {
        throw new Error("Invalid module count: must be greater than zero.");
      }

      const nWidth = Math.floor(_htOption.width / nCount);
      const nHeight = Math.floor(_htOption.height / nCount);

      if (nWidth <= 0 || nHeight <= 0) {
        throw new Error("Invalid width or height calculation: must be greater than zero.");
      }

      const aHTML = ['<table style="border:0;border-collapse:collapse;">'];

      for (let row = 0; row < nCount; row++) {
        aHTML.push('<tr>');
        for (let col = 0; col < nCount; col++) {
          const isDark = oQRCode.isDark(row, col);
          const { colorDark, colorLight } = _htOption;
          const tdStyle = `border:0;border-collapse:collapse;padding:0;margin:0;width:${nWidth}px;height:${nHeight}px;background-color:${isDark ? colorDark : colorLight};`;
          aHTML.push(`<td style="${tdStyle}"></td>`);
        }
        aHTML.push('</tr>');
      }

      aHTML.push('</table>');
      _el.innerHTML = aHTML.join('');

      const elTable = _el.childNodes[0];
      const nLeftMarginTable = (_htOption.width - elTable.offsetWidth) / 2;
      const nTopMarginTable = (_htOption.height - elTable.offsetHeight) / 2;

      if (nLeftMarginTable > 0 && nTopMarginTable > 0) {
        elTable.style.margin = `${nTopMarginTable}px ${nLeftMarginTable}px`;
      }
    };

    Drawing.prototype.clear = function () {
      this._el.innerHTML = '';
    };

    return Drawing;
  })() : (function () {
    function _onMakeImage() {
      this._elImage.src = this._elCanvas.toDataURL("image/png");
      this._elImage.style.display = "block";
      this._elCanvas.style.display = "none";
    }

    if (this._android && this._android <= 2.1) {
      const factorInner = 1 / window.devicePixelRatio;
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        const image = args[0];
        const factor = 2;
        const argsCopy = [...args];
        const isValidImage = typeof image.nodeName === 'string' && /img/i.test(image.nodeName);
        if ( image && isValidImage ) {
          for (let i = 1; i < argsCopy.length; i++) {
            if (typeof argsCopy[i] === 'number') {
              argsCopy[i] *= factor;
            }
          }
        } else {
          const slice = argsCopy.slice(1, 5);
          for (let i = 0; i < slice.length; i++) {
            if (typeof slice[i] === 'number') {
              slice[i] *= factor;
            }
          }
          argsCopy.splice(1, 4, ...slice);
        }
        return drawImage.apply(this, argsCopy);
      };
    }

    function _safeSetDataURI(fSuccess, fFail) {
      let setDataURI = this;
      setDataURI._fFail = fFail;
      setDataURI._fSuccess = fSuccess;

      if (setDataURI._bSupportDataURI === null) {
        const element = document.createElement("img");
        const fOnError = function () {
          setDataURI._bSupportDataURI = false;

          if (setDataURI._fFail) {
            setDataURI._fFail.call(setDataURI);
          }
        };
        const fOnSuccess = function () {
          setDataURI._bSupportDataURI = true;

          if (setDataURI._fSuccess) {
            setDataURI._fSuccess.call(setDataURI);
          }
        };

        element.onabort = fOnError;
        element.onerror = fOnError;
        element.onload = fOnSuccess;
        element.src = "data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";
      } else if (setDataURI._bSupportDataURI === true && setDataURI._fSuccess) {
        setDataURI._fSuccess.call(setDataURI);
      } else if (setDataURI._bSupportDataURI === false && setDataURI._fFail) {
        setDataURI._fFail.call(setDataURI);
      } else {
        throw new Error("makeImage: Invalid state");
      }
    }

    const Drawing = function (el, htOption) {
      this._bIsPainted = false;
      this._android = _getAndroid();

      this._htOption = htOption;
      this._elCanvas = document.createElement("canvas");
      this._elCanvas.width = htOption.width;
      this._elCanvas.height = htOption.height;
      el.appendChild(this._elCanvas);
      this._el = el;
      this._oContext = this._elCanvas.getContext("2d");
      this._bIsPainted = false;
      this._elImage = document.createElement("img");
      this._elImage.alt = "";
      this._elImage.style.display = "none";
      this._el.appendChild(this._elImage);
      this._bSupportDataURI = null;
    };

    Drawing.prototype.draw = function (oQRCode) {
      const _elImage = this._elImage;
      const canvasContext = this._oContext;
      const _htOption = this._htOption;

      const moduleCount = oQRCode.getModuleCount();
      const moduleWidth = _htOption.width / moduleCount;
      const moduleHeight = _htOption.height / moduleCount;
      const roundedModuleWidth = Math.round(moduleWidth);
      const roundedModuleHeight = Math.round(moduleHeight);

      _elImage.style.display = "none";
      this.clear();

      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          const bIsDark = oQRCode.isDark(row, col);
          const nLeft = col * moduleWidth;
          const nTop = row * moduleHeight;
          canvasContext.strokeStyle = bIsDark ? _htOption.colorDark : _htOption.colorLight;
          canvasContext.lineWidth = 1;
          canvasContext.fillStyle = bIsDark ? _htOption.colorDark : _htOption.colorLight;
          canvasContext.fillRect(nLeft, nTop, moduleWidth, moduleHeight);

          canvasContext.strokeRect(
            Math.floor(nLeft) + 0.5,
            Math.floor(nTop) + 0.5,
            roundedModuleWidth,
            roundedModuleHeight
          );

          canvasContext.strokeRect(
            Math.ceil(nLeft) - 0.5,
            Math.ceil(nTop) - 0.5,
            roundedModuleWidth,
            roundedModuleHeight
          );
        }
      }

      this._bIsPainted = true;
    };

    Drawing.prototype.makeImage = function () {
      if (this._bIsPainted) {
        _safeSetDataURI.call(this, _onMakeImage);
      }
    };

    Drawing.prototype.isPainted = function () {
      return this._bIsPainted;
    };

    Drawing.prototype.clear = function () {
      this._oContext.clearRect(0, 0, this._elCanvas.width, this._elCanvas.height);
      this._bIsPainted = false;
    };

    Drawing.prototype.round = function (inputNumber) {
      if (!inputNumber) {
        return inputNumber;
      }

      return Math.floor(inputNumber * 1000) / 1000;
    };

    return Drawing;
  })();
  let DrawingObj = useSVG ? svgDrawer : noSVGDrawer;

  function _getTypeNumber(sText, nCorrectLevel) {
    let nType = 1;
    const length = _getUTF8Length(sText);
    QRCodeLimitLength = wholeExtension?.QRCodeLimitLength || [];

    for (let i = 0, len = QRCodeLimitLength.length; i <= len; i++) {
      let nLimit = 0;

      const errorLevelToLimitIndex = {
        [QRErrorCorrectLevel.L]: 0,
        [QRErrorCorrectLevel.M]: 1,
        [QRErrorCorrectLevel.Q]: 2,
        [QRErrorCorrectLevel.H]: 3
      };

      nLimit = QRCodeLimitLength[i][errorLevelToLimitIndex[nCorrectLevel]];

      if (length <= nLimit) {
        break;
      } else {
        nType++;
      }
    }

    if (nType > QRCodeLimitLength.length) {
      throw new Error("Too long data");
    }

    return nType;
  }

  function _getUTF8Length(sText) {
    const replacedText = encodeURI(sText).toString().replace(/%[0-9a-fA-F]{2}/g, 'a');
    return replacedText.length + (replacedText.length !== sText ? 3 : 0);
  }

  QRCode = function (targetEl, opt, extendJson) {
    let el = targetEl;
    let vOption = opt;
    this._htOption = {
      width: 257,
      typeNumber: 1,
      colorDark: "#000000",
      height: 257,
      colorLight: "#ffffff",
      correctLevel: QRErrorCorrectLevel.H
    };
    wholeExtension = extendJson;

    if (typeof vOption === 'string') {
      vOption = {
        text: vOption
      };
    }
    if (vOption) {
      Object.keys(vOption).forEach((key) => {
        this._htOption[key] = vOption[key];
      });
    }

    if (typeof el === "string") {
      el = document.getElementById(el);
    }

    if (this._htOption.useSVG) {
      DrawingObj = svgDrawer;
    }

    this._android = _getAndroid();
    this._el = el;
    this._oQRCode = null;
    this._oDrawing = new DrawingObj(this._el, this._htOption);

    if (this._htOption.text) {
      this.makeCode(this._htOption.text);
    }
  };

  QRCode.prototype.makeCode = function (paramText) {
    this._oQRCode = new QRCodeModel(_getTypeNumber(paramText, this._htOption.correctLevel), this._htOption.correctLevel);
    this._oQRCode.addData(paramText);
    this._oQRCode.make();
    this._el.title = paramText;
    this._oDrawing.draw(this._oQRCode);
    this.makeImage();
  };

  QRCode.prototype.makeImage = function () {
    if (typeof this._oDrawing.makeImage === "function" && (!this._android || this._android >= 3)) {
      this._oDrawing.makeImage();
    }
  };

  QRCode.prototype.clear = function () {
    this._oDrawing.clear();
  };

  QRCode.CorrectLevel = QRErrorCorrectLevel;
})();
