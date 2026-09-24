const { test, expect } = require('@playwright/test');
const fs=require('fs');
const path=require('path');

const catPaths={auto:'auto',food:'food',money:'soldi',events:'eventi',docs:'documenti',home:'casa',travel:'viaggi',style:'persona',shopping:'shopping',territory:'territorio',business:'business',study:'studio'};

test('quality baseline home screenshots', async ({page},testInfo)=>{
  await page.goto('/');
  await page.waitForSelector('#categoryGrid .cat');
  const dir='test-results/quality-baseline';
  fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:`${dir}/home-${testInfo.project.name}.png`,fullPage:true});
  await expect(page.locator('#categoryGrid .cat')).toHaveCount(12);
});

test('quality baseline category screenshots', async ({page},testInfo)=>{
  const dir='test-results/quality-baseline/categories';
  fs.mkdirSync(dir,{recursive:true});
  for(const [id,p] of Object.entries(catPaths)){
    await page.goto('/'+p+'/');
    await page.waitForSelector('#apps .app');
    await page.screenshot({path:`${dir}/${id}-${testInfo.project.name}.png`,fullPage:true});
  }
});

const auditPath=path.join(process.cwd(),'quality-artifacts/quality-audit.json');
const catalogPath=path.join(process.cwd(),'apps.json');
const audit=fs.existsSync(auditPath) ? JSON.parse(fs.readFileSync(auditPath,'utf8')) : null;
const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));

if(audit && audit.visualSelection){
  for(const [category,ids] of Object.entries(audit.visualSelection)){
    test('visual audit '+category+': 3 weakest apps desktop/mobile', async ({page},testInfo)=>{
      test.setTimeout(60000);
      const dir='test-results/quality-baseline/apps';
      fs.mkdirSync(dir,{recursive:true});
      for(const id of ids){
        const app=catalog.apps.find(a=>a.id===id);
        expect(app).toBeTruthy();
        await page.goto('/'+app.path,{waitUntil:'domcontentloaded'});
        await page.waitForTimeout(200);
        await expect(page.locator('body')).not.toBeEmpty();
        await page.screenshot({path:`${dir}/${category}__${id}__${testInfo.project.name}.png`,fullPage:true});
      }
    });
  }
}else{
  test('visual audit selection is optional in clean CI checkout', async ()=>{
    expect(fs.existsSync(catalogPath)).toBeTruthy();
  });
}
