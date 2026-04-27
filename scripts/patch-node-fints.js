#!/usr/bin/env node
/**
 * Patches node-fints for Atruvia/Raiffeisenbank (HITANS version 7) compatibility.
 * Run automatically via postinstall.
 */
const fs = require('fs')
const path = require('path')

const base = path.join(__dirname, '..', 'node_modules', 'node-fints', 'dist')

function patch(file, search, replace) {
  const fullPath = path.join(base, file)
  if (!fs.existsSync(fullPath)) {
    console.warn(`[patch-node-fints] File not found: ${fullPath}`)
    return false
  }
  const src = fs.readFileSync(fullPath, 'utf8')
  if (src.includes(replace)) return false // already patched
  if (!src.includes(search)) {
    console.warn(`[patch-node-fints] Pattern not found in ${file} — skipping`)
    return false
  }
  fs.writeFileSync(fullPath, src.replace(search, replace), 'utf8')
  console.log(`[patch-node-fints] Patched ${file}`)
  return true
}

// 1. hitans.js — allow version 7 in segment deserialization
patch(
  'segments/hitans.js',
  'if (![1, 2, 3, 4, 5, 6].includes(this.version)) {',
  'if (![1, 2, 3, 4, 5, 6, 7].includes(this.version)) {'
)

// 2. hitan.js — allow version 7 in TAN challenge deserialization
patch(
  'segments/hitan.js',
  'if (![6].includes(this.version)) {',
  'if (![6, 7].includes(this.version)) {'
)

// 3. tan-method.js — register v7 argument map (same as v6, extra trailing fields ignored)
const tanMethodPath = path.join(base, 'tan-method.js')
const tanSrc = fs.readFileSync(tanMethodPath, 'utf8')
if (!tanSrc.includes('tanMethodArgumentMap.set(7,')) {
  const idx = tanSrc.lastIndexOf(']);\nclass TanMethod {')
  if (idx !== -1) {
    const patched =
      tanSrc.slice(0, idx + ']);\n'.length) +
      '// v7 extends v6 (extra trailing fields ignored)\nexports.tanMethodArgumentMap.set(7, exports.tanMethodArgumentMap.get(6));\n' +
      tanSrc.slice(idx + ']);\n'.length)
    fs.writeFileSync(tanMethodPath, patched, 'utf8')
    console.log('[patch-node-fints] Patched tan-method.js (v7 map)')
  }
}

// 4. hktan.js — add version 7 support (same serialization as v6 for process 4)
patch(
  'segments/hktan.js',
  'if (![3, 4, 5, 6].includes(version)) {',
  'if (![3, 4, 5, 6, 7].includes(version)) {'
)
patch(
  'segments/hktan.js',
  '            throw new Error(`HKTAN version ${process} not implemented.`);',
  '            throw new Error(`HKTAN version ${version} not implemented.`);'
)
patch(
  'segments/hktan.js',
  '                if (version === 6) {\n                    return [process, segmentReference, "", "", "", "", "", "", "", "", medium];\n                }',
  '                if (version === 6 || version === 7) {\n                    return [process, segmentReference, "", "", "", "", "", "", "", "", medium];\n                }'
)
patch(
  'segments/hktan.js',
  '                if (version === 6) {\n                    return [process, "HKIDN"];\n                }',
  '                if (version === 6 || version === 7) {\n                    return [process, "HKIDN"];\n                }'
)
patch(
  'segments/hktan.js',
  '                if (version === 6) {\n                    return [process, "", "", "", aref, "N"];\n                }',
  '                if (version === 6 || version === 7) {\n                    return [process, "", "", "", aref, "N"];\n                }'
)

// 5. dialog.js — add HKTAN to sync() using dynamic version (required by Atruvia)
patch(
  'dialog.js',
  `                new segments_1.HKIDN({ segNo: 3, blz, name, systemId: "0" }),
                new segments_1.HKVVB({ segNo: 4, productId: this.productId, lang: 0 }),
                new segments_1.HKSYN({ segNo: 5 }),
            ];`,
  `                new segments_1.HKIDN({ segNo: 3, blz, name, systemId: "0" }),
                new segments_1.HKVVB({ segNo: 4, productId: this.productId, lang: 0 }),
                new segments_1.HKSYN({ segNo: 5 }),
                new segments_1.HKTAN({ segNo: 6, version: Math.max(6, this.hktanVersion || 6), process: "4" }),
            ];`
)

// 6. dialog.js — use real systemId + dynamic hktanVersion in init()
patch(
  'dialog.js',
  `                new segments_1.HKIDN({ segNo: 3, blz, name, systemId: "0" }),
                new segments_1.HKVVB({ segNo: 4, productId: this.productId, lang: 0 }),
            ];
            if (this.hktanVersion >= 6) {
                segments.push(new segments_1.HKTAN({ segNo: 5, version: 6, process: "4" }));
            }
            const response = yield this.send(new request_1.Request({ blz, name, pin, systemId: "0", dialogId, msgNo, segments, tanMethods }));`,
  `                new segments_1.HKIDN({ segNo: 3, blz, name, systemId: this.systemId || "0" }),
                new segments_1.HKVVB({ segNo: 4, productId: this.productId, lang: 0 }),
            ];
            if (this.hktanVersion >= 6) {
                segments.push(new segments_1.HKTAN({ segNo: 5, version: this.hktanVersion, process: "4" }));
            }
            const response = yield this.send(new request_1.Request({ blz, name, pin, systemId: this.systemId || "0", dialogId, msgNo, segments, tanMethods }));`
)
