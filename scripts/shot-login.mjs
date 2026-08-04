import { chromium } from "playwright";
const b = await chromium.launch();
for (const [w,h,name] of [[1440,900,"desktop"],[1024,720,"notebook"],[390,840,"mobile"]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h} });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3137/login", { waitUntil:"networkidle", timeout:30000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path:`./.shots/login-${name}.png` });
  await ctx.close();
  console.log("shot", name);
}
await b.close();
