import test from 'node:test';
import assert from 'node:assert/strict';
import {canViewFinancialReports} from '../report-metrics.js';

test('reports_view da solo non abilita costi e margini',()=>{
  assert.equal(canViewFinancialReports({role:'OPERATORE',permissions:{reports_view:true}},false),false);
  assert.equal(canViewFinancialReports({role:'OPERATORE',permissions:{finance_view:true}},false),true);
});
