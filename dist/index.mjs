import fs from "fs";
import fsp from "fs/promises";
import { join, basename, sep, dirname, extname } from "pathe";
import ansi from "ansi-colors";
const FILENAME_RE = /(^|[/\\])([^/\\]+?)(?=(\.[^.]+)?$)/;
function filename(path) {
  var _a;
  return (_a = path.match(FILENAME_RE)) == null ? void 0 : _a[2];
}
function isRegex(src) {
  return Object.prototype.toString.call(src) === "[object RegExp]";
}
function isString(src) {
  return Object.prototype.toString.call(src) === "[object String]";
}
function isArray(src) {
  return Array.isArray(src);
}
function merge(src, target) {
  const deepClone = (src2) => {
    if (typeof src2 !== "object" || isRegex(src2) || src2 === null)
      return src2;
    const target2 = Array.isArray(src2) ? [] : {};
    for (const key in src2) {
      const value = src2[key];
      target2[key] = deepClone(value);
    }
    return target2;
  };
  const clone = deepClone(src);
  for (const key in target) {
    if (clone[key] === void 0) {
      clone[key] = target[key];
    }
  }
  return clone;
}
function readAllFiles(root) {
  let resultArr = [];
  try {
    if (fs.existsSync(root)) {
      const stat = fs.lstatSync(root);
      if (stat.isDirectory()) {
        const files = fs.readdirSync(root);
        files.forEach(function(file) {
          const t = readAllFiles(join(root, "/", file));
          resultArr = resultArr.concat(t);
        });
      } else {
        resultArr.push(root);
      }
    }
  } catch (error) {
    console.log(error);
  }
  return resultArr;
}
function areFilesMatching(fileName, matcher) {
  if (isString(matcher))
    return fileName === matcher;
  if (isRegex(matcher))
    return matcher.test(fileName);
  if (isArray(matcher))
    return matcher.includes(fileName);
  return false;
}
function decideStyle(text, enableColors) {
  return enableColors ? text : ansi.unstyle(text);
}
function logErrors(rootConfig, errorsMap, ansiColors) {
  rootConfig.logger.info(decideStyle(`
🚨 ${ansi.red("[vite-plugin-image-optimizer]")} - errors during optimization: `, ansiColors));
  const keyLengths = Array.from(errorsMap.keys(), (name) => name.length);
  const maxKeyLength = Math.max(...keyLengths);
  errorsMap.forEach((message, name) => {
    rootConfig.logger.error(
      decideStyle(
        `${ansi.dim(basename(rootConfig.build.outDir))}/${ansi.blueBright(name)}${" ".repeat(2 + maxKeyLength - name.length)} ${ansi.red(
          message
        )}`,
        ansiColors
      )
    );
  });
  rootConfig.logger.info("\n");
}
function logOptimizationStats(rootConfig, sizesMap, ansiColors) {
  rootConfig.logger.info(decideStyle(`
✨ ${ansi.cyan("[vite-plugin-image-optimizer]")} - optimized images successfully: `, ansiColors));
  const keyLengths = Array.from(sizesMap.keys(), (name) => name.length);
  const valueLengths = Array.from(sizesMap.values(), (value) => `${Math.floor(100 * value.ratio)}`.length);
  const maxKeyLength = Math.max(...keyLengths);
  const valueKeyLength = Math.max(...valueLengths);
  let totalOriginalSize = 0;
  let totalSavedSize = 0;
  sizesMap.forEach((value, name) => {
    const { size, oldSize, ratio, skipWrite, isCached } = value;
    const percentChange = ratio > 0 ? ansi.red(`+${ratio}%`) : ratio <= 0 ? ansi.green(`${ratio}%`) : "";
    const sizeText = skipWrite ? `${ansi.yellow.bold("skipped")} ${ansi.dim(`original: ${oldSize.toFixed(2)} kB <= optimized: ${size.toFixed(2)} kB`)}` : isCached ? `${ansi.yellow.bold("cached")} ${ansi.dim(`original: ${oldSize.toFixed(2)} kB; cached: ${size.toFixed(2)} kB`)}` : ansi.dim(`${oldSize.toFixed(2)} kB ⭢  ${size.toFixed(2)} kB`);
    rootConfig.logger.info(
      decideStyle(
        ansi.dim(basename(rootConfig.build.outDir)) + "/" + ansi.blueBright(name) + " ".repeat(2 + maxKeyLength - name.length) + ansi.gray(`${percentChange} ${" ".repeat(valueKeyLength - `${ratio}`.length)}`) + " " + sizeText,
        ansiColors
      )
    );
    if (!skipWrite) {
      totalOriginalSize += oldSize;
      totalSavedSize += oldSize - size;
    }
  });
  if (totalSavedSize > 0) {
    const savedText = `${totalSavedSize.toFixed(2)}kB`;
    const originalText = `${totalOriginalSize.toFixed(2)}kB`;
    const savingsPercent = `${Math.round(totalSavedSize / totalOriginalSize * 100)}%`;
    rootConfig.logger.info(
      decideStyle(`
💰 total savings = ${ansi.green(savedText)}/${ansi.green(originalText)} ≈ ${ansi.green(savingsPercent)}`, ansiColors)
    );
  }
  rootConfig.logger.info("\n");
}
const VITE_PLUGIN_NAME = "vite-plugin-image-optimizer";
const DEFAULT_OPTIONS = {
  logStats: true,
  ansiColors: true,
  includePublic: true,
  exclude: void 0,
  include: void 0,
  test: /\.(jpe?g|png|gif|tiff|webp|svg|avif)$/i,
  svg: {
    multipass: true,
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            cleanupNumericValues: false,
            removeViewBox: false
            // https://github.com/svg/svgo/issues/1128
          },
          cleanupIDs: {
            minify: false,
            remove: false
          },
          convertPathData: false
        }
      },
      "sortAttrs",
      {
        name: "addAttributesToSVGElement",
        params: {
          attributes: [{ xmlns: "http://www.w3.org/2000/svg" }]
        }
      }
    ]
  },
  png: {
    // https://sharp.pixelplumbing.com/api-output#png
    quality: 100
  },
  jpeg: {
    // https://sharp.pixelplumbing.com/api-output#jpeg
    quality: 100
  },
  jpg: {
    // https://sharp.pixelplumbing.com/api-output#jpeg
    quality: 100
  },
  tiff: {
    // https://sharp.pixelplumbing.com/api-output#tiff
    quality: 100
  },
  // gif does not support lossless compression
  // https://sharp.pixelplumbing.com/api-output#gif
  gif: {},
  webp: {
    // https://sharp.pixelplumbing.com/api-output#webp
    lossless: true
  },
  avif: {
    // https://sharp.pixelplumbing.com/api-output#avif
    lossless: true
  },
  cache: false,
  cacheLocation: void 0
};
function ViteImageOptimizer(optionsParam = {}) {
  const options = merge(optionsParam, DEFAULT_OPTIONS);
  let outputPath;
  let publicDir;
  let rootConfig;
  const sizesMap = /* @__PURE__ */ new Map();
  const mtimeCache = /* @__PURE__ */ new Map();
  const errorsMap = /* @__PURE__ */ new Map();
  const applySVGO = async (filePath, buffer) => {
    const optimize = (await import("svgo")).optimize;
    return Buffer.from(
      optimize(buffer.toString(), {
        path: filePath,
        ...options.svg
      }).data
    );
  };
  const applySharp = async (filePath, buffer) => {
    const sharp = (await import("sharp")).default;
    const extName = extname(filePath).replace(".", "").toLowerCase();
    return await sharp(buffer, { animated: extName === "gif" }).toFormat(extName, options[extName]).toBuffer();
  };
  const processFile = async (filePath, buffer) => {
    try {
      let newBuffer;
      let isCached;
      const cachedFilePath = join(options.cacheLocation, filePath);
      if (options.cache === true && fs.existsSync(cachedFilePath)) {
        newBuffer = await fsp.readFile(cachedFilePath);
        isCached = true;
      } else {
        const engine = /\.svg$/.test(filePath) ? applySVGO : applySharp;
        newBuffer = await engine(filePath, buffer);
        isCached = false;
      }
      if (options.cache === true && !isCached) {
        if (!fs.existsSync(dirname(cachedFilePath))) {
          await fsp.mkdir(dirname(cachedFilePath), {
            recursive: true
          });
        }
        await fsp.writeFile(cachedFilePath, newBuffer);
      }
      const newSize = newBuffer.byteLength;
      const oldSize = buffer.byteLength;
      const skipWrite = newSize >= oldSize;
      sizesMap.set(filePath, {
        size: newSize / 1024,
        oldSize: oldSize / 1024,
        ratio: Math.floor(100 * (newSize / oldSize - 1)),
        skipWrite,
        isCached
      });
      return { content: newBuffer, skipWrite };
    } catch (error) {
      errorsMap.set(filePath, error.message);
      return {};
    }
  };
  const getFilesToProcess = (allFiles, getFileName) => {
    if (options.include) {
      return allFiles.reduce((acc, filePath) => {
        const fileName = getFileName(filePath);
        if (areFilesMatching(fileName, options.include)) {
          acc.push(filePath);
        }
        return acc;
      }, []);
    }
    return allFiles.reduce((acc, filePath) => {
      var _a;
      if ((_a = options.test) == null ? void 0 : _a.test(filePath)) {
        const fileName = getFileName(filePath);
        if (!areFilesMatching(fileName, options.exclude)) {
          acc.push(filePath);
        }
      }
      return acc;
    }, []);
  };
  const ensureCacheDirectoryExists = async function() {
    if (options.cache === true && !fs.existsSync(options.cacheLocation)) {
      await fsp.mkdir(options.cacheLocation, { recursive: true });
    }
  };
  return {
    name: VITE_PLUGIN_NAME,
    enforce: "post",
    apply: "build",
    configResolved(c) {
      rootConfig = c;
      outputPath = c.build.outDir;
      if (typeof c.publicDir === "string") {
        publicDir = c.publicDir.replace(/\\/g, "/");
      }
    },
    generateBundle: async (_, bundler) => {
      const allFiles = Object.keys(bundler);
      const includedFiles = getFilesToProcess(allFiles, (path) => bundler[path].name);
      if (includedFiles.length > 0)
        await ensureCacheDirectoryExists();
      const handles = allFiles.map(async (filePath) => {
        const source = bundler[filePath].source;
        if (includedFiles.includes(filePath)) {
          const { content, skipWrite } = await processFile(filePath, source);
          if ((content == null ? void 0 : content.length) > 0 && !skipWrite) {
            bundler[filePath].source = content;
          }
        }
      });
      await Promise.all(handles);
    },
    async closeBundle() {
      if (publicDir && options.includePublic) {
        const allFiles = readAllFiles(publicDir);
        const includedFiles = getFilesToProcess(allFiles, (path) => filename(path) + extname(path));
        if (allFiles.length > 0)
          await ensureCacheDirectoryExists();
        const handles = allFiles.map(async (publicFilePath) => {
          const filePath = publicFilePath.replace(publicDir + sep, "");
          const fullFilePath = join(rootConfig.root, outputPath, filePath);
          if (fs.existsSync(fullFilePath) === false)
            return;
          const { mtimeMs } = await fsp.stat(fullFilePath);
          if (mtimeMs <= (mtimeCache.get(filePath) || 0))
            return;
          const buffer = await fsp.readFile(fullFilePath);
          if (includedFiles.includes(publicFilePath)) {
            const { content, skipWrite } = await processFile(filePath, buffer);
            if ((content == null ? void 0 : content.length) > 0 && !skipWrite) {
              await fsp.writeFile(fullFilePath, content);
              mtimeCache.set(filePath, Date.now());
            }
          } else {
            await fsp.writeFile(fullFilePath, buffer);
          }
        });
        await Promise.all(handles);
      }
      if (sizesMap.size > 0 && options.logStats) {
        logOptimizationStats(rootConfig, sizesMap, options.ansiColors);
      }
      if (errorsMap.size > 0) {
        logErrors(rootConfig, errorsMap, options.ansiColors);
      }
    }
  };
}
export {
  ViteImageOptimizer
};
