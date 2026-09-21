const {test,expect}=require('@playwright/test');

const mergedIds=new Set([
 'bollo-check','revisione-memo','tyre-memo','service-book','damage-log',
 'expiry-food','freezer-memo','daily-spend','budget-lite','receipt-box',
 'home-docs','car-docs','booking-lite'
]);

test('natural-language intents prefer canonical active products',async({page})=>{
  await page.goto('/');
  const q=page.locator('#globalSearch');
  const cases=[
    ['mi scade la revisione','autobuddy'],
    ['devo organizzare i documenti auto','autobuddy'],
    ['voglio risparmiare','savings-goal'],
    ['devo dividere una cena','splitly'],
    ['quanto costa davvero la macchina','carcost']
  ];
  for(const [query,id] of cases){
    await q.fill(query);
    const first=page.locator('#searchResults .res[href]').first();
    await expect(first,query).toBeVisible();
    await expect(first,query).toHaveAttribute('data-app-id',id);
  }
});

test('intent results do not send users through merged compatibility routes',async({page})=>{
  await page.goto('/');
  const q=page.locator('#globalSearch');
  for(const query of ['revisione auto','scadenze macchina','budget casa','documenti auto']){
    await q.fill(query);
    const ids=await page.locator('#searchResults .res[data-app-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.appId));
    expect(ids.filter(id=>mergedIds.has(id)),query).toEqual([]);
  }
});
