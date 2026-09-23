const { test, expect } = require('@playwright/test');

async function createGroup(page,name='Weekend QA',people='Alice, Bob, Carlo'){
  await page.locator('#gName').fill(name);
  await page.locator('#gPeople').fill(people);
  await page.getByRole('button',{name:'Salva gruppo'}).click();
}

test.describe('Splitly finalization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/splitly/');
  });

  test('controls are accessible and back returns to Soldi', async ({ page }) => {
    await expect(page.locator('.top a')).toHaveAttribute('href','../soldi/');
    for(const id of ['gName','gPeople','xDesc','xAmt','xPayer','xCat','xMode','xDate','search','catFilter','importFile']){
      const el=page.locator('#'+id);
      const name=await el.evaluate(node=>{
        if(node.labels?.length)return [...node.labels].map(x=>x.textContent.trim()).join(' ');
        return node.getAttribute('aria-label')||node.getAttribute('aria-labelledby')||'';
      });
      expect(name,id+' must have an accessible name').not.toBe('');
    }
    await expect(page.locator('#xAmt')).toHaveAttribute('min','0.01');
    await expect(page.locator('#importFile')).toHaveAttribute('accept','.json,application/json');
  });

  test('group requires a name and at least two unique people', async ({ page }) => {
    const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
    await page.locator('#gPeople').fill('Alice');
    await page.getByRole('button',{name:'Salva gruppo'}).click();
    expect(dialogs.at(-1)).toContain('nome');
    await page.locator('#gName').fill('Cena');
    await page.getByRole('button',{name:'Salva gruppo'}).click();
    expect(dialogs.at(-1)).toContain('almeno due');
    await page.locator('#gPeople').fill('Alice, Alice, Bob');
    await page.getByRole('button',{name:'Salva gruppo'}).click();
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('splitly.v2')));
    expect(stored.people).toEqual(['Alice','Bob']);
  });

  test('10 euro equal split among three people stays exact to the cent', async ({ page }) => {
    await createGroup(page);
    await page.evaluate(()=>go('expense'));
    await page.locator('#xDesc').fill('Cena');
    await page.locator('#xAmt').fill('10');
    await page.locator('#xPayer').selectOption({label:'Alice'});
    await page.getByRole('button',{name:'Aggiungi spesa'}).click();
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('splitly.v2')));
    expect(stored.expenses[0].shares.map(x=>x.amount)).toEqual([3.34,3.33,3.33]);
    expect(Math.round(stored.expenses[0].shares.reduce((a,b)=>a+b.amount,0)*100)).toBe(1000);
    await page.evaluate(()=>go('balances'));
    await expect(page.locator('#settlements')).toContainText('€3,33');
  });

  test('percent split uses largest-remainder cents without losing money', async ({ page }) => {
    await createGroup(page);
    await page.evaluate(()=>go('expense'));
    await page.locator('#xDesc').fill('Hotel');
    await page.locator('#xAmt').fill('10');
    await page.locator('#xPayer').selectOption({label:'Alice'});
    await page.locator('#xMode').selectOption('percent');
    const shares=page.locator('.shareInput');
    await shares.nth(0).fill('33.33');
    await shares.nth(1).fill('33.33');
    await shares.nth(2).fill('33.34');
    await page.getByRole('button',{name:'Aggiungi spesa'}).click();
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('splitly.v2')));
    expect(Math.round(stored.expenses[0].shares.reduce((a,b)=>a+b.amount,0)*100)).toBe(1000);
    expect(stored.expenses[0].shares.map(x=>x.amount)).toEqual([3.33,3.33,3.34]);
  });

  test('negative and inconsistent exact shares are rejected', async ({ page }) => {
    const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
    await createGroup(page,'Cena','Alice, Bob');
    await page.evaluate(()=>go('expense'));
    await page.locator('#xDesc').fill('Taxi');
    await page.locator('#xAmt').fill('-5');
    await page.locator('#xPayer').selectOption({label:'Alice'});
    await page.getByRole('button',{name:'Aggiungi spesa'}).click();
    expect(dialogs.at(-1)).toContain('importo positivo');

    await page.locator('#xAmt').fill('10');
    await page.locator('#xMode').selectOption('exact');
    await page.locator('.shareInput').nth(0).fill('-1');
    await page.locator('.shareInput').nth(1).fill('11');
    await page.getByRole('button',{name:'Aggiungi spesa'}).click();
    expect(dialogs.at(-1)).toContain('non negativi');

    await page.locator('.shareInput').nth(0).fill('4');
    await page.locator('.shareInput').nth(1).fill('5');
    await page.getByRole('button',{name:'Aggiungi spesa'}).click();
    expect(dialogs.at(-1)).toContain('esattamente');
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('splitly.v2')));
    expect(stored.expenses).toHaveLength(0);
  });

  test('malicious backup is normalized and invalid expenses are dropped', async ({ page }) => {
    const backup={
      version:2,name:'<img src=x onerror="window.__xss=1">',people:['Alice','Bob','Alice',''],
      expenses:[
        {id:1,desc:'Cena',amt:10,payer:'Alice',cat:'Cibo',date:'2026-09-23',mode:'equal',shares:[{name:'Alice',amount:5},{name:'Bob',amount:5}]},
        {id:'1);window.__xss=1;//',desc:'Injected',amt:10,payer:'Alice',cat:'Cibo',shares:[{name:'Alice',amount:10}]},
        {id:2,desc:'Wrong sum',amt:10,payer:'Alice',cat:'Cibo',shares:[{name:'Alice',amount:2},{name:'Bob',amount:2}]}
      ]
    };
    await page.addInitScript(()=>{window.__xss=0});
    page.on('dialog',async d=>{await d.accept()});
    await page.evaluate(()=>go('settings'));
    await page.locator('#importFile').setInputFiles({name:'splitly.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('splitly.v2')));
    expect(stored.people).toEqual(['Alice','Bob']);
    expect(stored.expenses).toHaveLength(1);
    expect(await page.evaluate(()=>window.__xss)).toBe(0);
  });

  for(const width of [360,390,430]){
    test('mobile has no horizontal overflow at '+width+'px',async({page})=>{
      await page.setViewportSize({width,height:844});
      await page.goto('/splitly/');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});