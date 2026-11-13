const fs = require('node:fs/promises');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const light = process.argv.includes('--light');
const output = path.resolve(__dirname, '../.impeccable/proposals', light ? 'light' : '.');
const themes = [
  { id: 'a', title: 'A · 深海蓝', desc: '蓝黑底色 · 冰蓝操作色 · 层叠方块图标', bg:'#0b1220', shell:'#101c2d', panel:'#15243a', field:'#0c1728', line:'#2b405b', ink:'#eef5ff', muted:'#a5b8d1', accent:'#78b8ff', button:'#2676d9', hover:'#1a3354', code:'#b8dbff', icon:'<rect x="16" y="12" width="30" height="30" rx="8" fill="#448cdf"/><rect x="26" y="24" width="30" height="30" rx="8" fill="#a8d4ff"/><path d="m35 34 7 5-7 5" fill="none" stroke="#173758" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>', note:'柔和、安静，蓝色贯穿界面层次。' },
  { id: 'b', title: 'B · 石墨钴蓝', desc: '中性炭灰底色 · 钴蓝按钮 · 四格工具图标', bg:'#141517', shell:'#1b1d21', panel:'#24272d', field:'#181a1e', line:'#3c414b', ink:'#f3f4f7', muted:'#b0b5c0', accent:'#91afff', button:'#365ee8', hover:'#27314b', code:'#d6deef', icon:'<rect x="14" y="14" width="16" height="16" rx="4" fill="#eaf0ff"/><rect x="35" y="14" width="16" height="16" rx="4" fill="#eaf0ff"/><rect x="14" y="35" width="16" height="16" rx="4" fill="#eaf0ff"/><path d="M38 36h13v15H36V38" fill="#94afff"/><path d="m36 43 6 6 11-13" fill="none" stroke="#141c45" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>', note:'对比清楚，蓝色集中在选中项和操作。' },
  { id: 'c', title: 'C · 极夜电蓝', desc: '近黑底色 · 明亮电蓝 · 快捷闪电图标', bg:'#090b0e', shell:'#11161c', panel:'#18212a', field:'#0c1117', line:'#30404e', ink:'#edf8ff', muted:'#a8bdcb', accent:'#59c5ff', button:'#087bb4', hover:'#143346', code:'#a5e2ff', icon:'<path d="M37 10 17 36h15l-5 19 24-30H36z" fill="#79d4ff"/><path d="M12 20v-7h9M52 43v9h-9" fill="none" stroke="#d6f2ff" stroke-width="3" stroke-linecap="round"/>', note:'更强的明暗对比，突出快捷唤醒。' }
];
if (light) {
  const palettes = [
    {title:'A · 雾白钴蓝',desc:'冷雾白底色 · 钴蓝操作色 · 层叠方块图标',bg:'#edf1f7',shell:'#f8faff',panel:'#e9eff9',field:'#ffffff',line:'#cbd5e5',ink:'#202c40',muted:'#52627a',accent:'#285bba',button:'#285bba',hover:'#e4edfc',code:'#2b4266',note:'清爽、利落，蓝色层次更明显。'},
    {title:'B · 纯白石墨',desc:'中性白底色 · 石墨文字 · 四格工具图标',bg:'#f1f2f4',shell:'#ffffff',panel:'#f0f2f6',field:'#ffffff',line:'#d0d4dd',ink:'#262b35',muted:'#5b6372',accent:'#355ac7',button:'#355ac7',hover:'#edf1fc',code:'#343d50',note:'中性、简洁，重点操作用蓝色突出。'},
    {title:'C · 暖纸浅蓝',desc:'暖白底色 · 柔和蓝色 · 快捷闪电图标',bg:'#f2efe9',shell:'#fcfaf6',panel:'#eeece7',field:'#fffefa',line:'#d7d3cb',ink:'#343a42',muted:'#626974',accent:'#326595',button:'#326595',hover:'#e6edf4',code:'#3b536b',note:'温和、不冷硬，蓝色与暖白平衡。'}
  ];
  themes.forEach((theme,i)=>Object.assign(theme,palettes[i]));
}
const svg = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const search = svg('<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>');
const json = svg('<path d="M8 4H6v6l-2 2 2 2v6h2M16 4h2v6l2 2-2 2v6h-2"/><path d="M10 9h4M10 15h4"/>');
const key = svg('<circle cx="9" cy="9" r="4"/><path d="m12 12 8 8m-4-4 3-3m-5 1 2-2"/>');
function html(t) {
  const logo = `<svg class="logo" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${t.button}"/>${t.icon}</svg>`;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;background:${t.bg};color:${t.ink};font:14px "Segoe UI","Microsoft YaHei UI",sans-serif;padding:35px 40px;width:1120px;height:830px}h1,h2,p{margin:0}h1{font-size:27px;font-weight:650;letter-spacing:-.02em}.intro{display:flex;justify-content:space-between;align-items:center;margin-bottom:25px}.intro p{margin-top:9px;color:${t.muted};font-size:14px}.palette{display:flex;gap:7px}.palette i{width:29px;height:29px;border-radius:50%;border:1px solid ${t.line}}.grid{display:grid;grid-template-columns:470px 1fr;gap:24px}.left{display:flex;flex-direction:column;gap:22px}.window{border:1px solid ${t.line};border-radius:14px;overflow:hidden;background:${t.shell}}.titlebar{height:45px;display:flex;align-items:center;gap:9px;padding:0 16px;border-bottom:1px solid ${t.line};font-size:12px}.titlebar .logo{width:23px;height:23px;border-radius:6px}.close{margin-left:auto;color:${t.muted};font-size:18px}.content{padding:20px}.search{height:51px;border:1px solid ${t.accent};background:${t.field};border-radius:9px;display:flex;gap:10px;align-items:center;padding:0 13px;color:${t.muted};font-size:14px}.search svg{color:${t.accent}}svg{width:22px;height:22px;flex-shrink:0}.shortcut{margin-left:auto;padding:4px 6px;border:1px solid ${t.line};border-radius:4px;font-size:10px;white-space:nowrap}.section{display:flex;justify-content:space-between;color:${t.muted};font-size:11px;margin:21px 1px 10px}.row{display:flex;gap:13px;align-items:center;padding:14px 12px;border:1px solid transparent;border-radius:9px}.row.active{background:${t.hover};border-color:${t.line}}.toolicon{display:grid;place-items:center;width:38px;height:38px;border-radius:9px;background:${t.panel};color:${t.accent}}.row strong{font-size:14px;font-weight:600}.row p{font-size:11px;color:${t.muted};margin-top:6px}.foot{border-top:1px solid ${t.line};padding:13px 17px;font-size:11px;display:flex;justify-content:space-between;color:${t.muted}}.ready{color:${t.accent}}.help{font-size:11px;color:${t.muted};margin:20px 2px 0}.identity{padding:23px 24px;border-top:1px solid ${t.line};display:flex;gap:23px;align-items:center}.identity>.logo{width:74px;height:74px;flex-shrink:0}.identity h2{font-size:15px;margin-bottom:10px}.identity p{color:${t.muted};font-size:12px;line-height:1.8}.sizes{display:flex;gap:11px;align-items:center;margin-top:13px}.sizes .logo{width:24px;height:24px}.sizes .logo:last-child{width:16px;height:16px}.workspace .content{padding:19px}.heading{display:flex;align-items:center;gap:14px;margin:24px 0 20px}.back{color:${t.accent};font-size:12px}.heading h2{font-size:18px}.toolbar{display:flex;gap:7px;align-items:center;margin-bottom:14px}button{font:12px "Segoe UI","Microsoft YaHei UI",sans-serif;color:${t.ink};background:${t.panel};border:1px solid ${t.line};padding:8px 12px;border-radius:6px}.primary{background:${t.button};color:#fff;border-color:${t.button}}.small{font-size:11px;color:${t.muted};margin-left:4px}.editor{border:1px solid ${t.line};border-radius:8px;overflow:hidden;background:${t.field}}.label{display:flex;justify-content:space-between;background:${t.panel};padding:12px 13px;font-size:11px;border-bottom:1px solid ${t.line}}.label span:last-child{color:${t.accent}}pre{font:13px/1.9 Consolas,monospace;color:${t.code};margin:0;padding:18px 16px;height:289px}.editor-bottom{display:flex;justify-content:space-between;padding:10px 13px;font-size:10px;color:${t.muted};border-top:1px solid ${t.line}}.editor-bottom span:last-child{color:${t.accent}}.message{font-size:11px;color:${t.muted};margin-top:13px}.caption{display:flex;justify-content:space-between;font-size:12px;color:${t.muted};margin-top:24px;border-top:1px solid ${t.line};padding-top:18px}.caption span:last-child{color:${t.accent}}
  </style><div class="intro"><div><h1>${t.title}</h1><p>${t.desc}</p></div><div class="palette"><i style="background:${t.bg}"></i><i style="background:${t.panel}"></i><i style="background:${t.button}"></i><i style="background:${t.accent}"></i></div></div>
  <div class="grid"><div class="left"><div class="window"><div class="titlebar">${logo}<strong>Ssx 工具箱</strong><span class="close">×</span></div><div class="content"><div class="search">${search}<span>搜索工具，或直接粘贴 JSON…</span><span class="shortcut">Ctrl + 空格</span></div><div class="section"><span>全部工具</span><span>↑ ↓ 选择 · Enter 打开</span></div><div class="row active"><span class="toolicon">${json}</span><div><strong>JSON 格式化</strong><p>格式化、压缩与校验，保留长数字原文</p></div></div><div class="row"><span class="toolicon">${key}</span><div><strong>密码与 UUID 生成</strong><p>自定义随机密码、UUID，支持批量生成</p></div></div><p class="help">复制 JSON 后按 Ctrl + 空格，直接开始格式化。</p></div><div class="foot"><span class="ready">● 随时待命</span><span>Esc 隐藏窗口</span></div></div><div class="identity">${logo}<div><h2>应用 / 托盘图标</h2><p>${t.note}</p><div class="sizes">${logo}${logo}<span class="small">小尺寸识别预览</span></div></div></div></div>
  <div class="window workspace"><div class="titlebar">${logo}<strong>Ssx 工具箱</strong><span class="close">×</span></div><div class="content"><div class="search">${search}<span>搜索工具，或直接粘贴 JSON…</span></div><div class="heading"><span class="back">← 返回</span><h2>JSON 格式化</h2></div><div class="toolbar"><button class="primary">格式化</button><button>压缩</button><span class="small">缩进</span><button>2 空格⌄</button><button style="margin-left:auto">导入</button></div><div class="editor"><div class="label"><span>JSON 内容</span><span>复制结果</span></div><pre>{
  "name": "Ssx 工具箱",
  "tools": [
    "JSON 格式化",
    "随机密码",
    "UUID v4"
  ],
  "local": true
}</pre><div class="editor-bottom"><span>9 行 · 98 字符</span><span>保存 .json</span></div></div><p class="message">已格式化，JSON 格式正确。</p></div><div class="foot"><span class="ready">● 本地处理</span><span>Ctrl + Enter 格式化</span></div></div></div><div class="caption"><span>配色与图标方案预览 · 示例内容</span><span>布局与现有工具操作保持一致</span></div></html>`;
}
(async () => {
  await fs.mkdir(output, {recursive:true});
  for(const t of themes) await fs.writeFile(path.join(output,`theme-${t.id}.html`),html(t));
  const env={...process.env,TOOLBOX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({args:[path.resolve(__dirname,'..')],env});
  try {
    const page=await app.firstWindow();
    for(const t of themes){
      await app.evaluate(async ({BrowserWindow},file)=>{const win=BrowserWindow.getAllWindows()[0];win.setBounds({width:1120,height:830});await win.loadFile(file);},path.join(output,`theme-${t.id}.html`));
      await page.screenshot({path:path.join(output,`theme-${t.id}.png`),fullPage:true});
    }
    console.log('Created theme previews A, B, C at '+output);
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
