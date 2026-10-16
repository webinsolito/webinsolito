import {describe,expect,it} from 'vitest'
import {parseExpenseText} from './documentOcr'
import type {Vehicle} from '../types'

const vehicles:Vehicle[]=[{id:'car-1',dealer_id:'dealer',brand:'BMW',model:'X1',plate:'AB123CD',vin:'WBA12345678901234'},{id:'car-2',dealer_id:'dealer',brand:'Fiat',model:'500',plate:'EF456GH'}]

describe('expense OCR parsing',()=>{
  it('extracts Italian invoice total, date, plate and vehicle',()=>{
    const result=parseExpenseText(`OFFICINA ROSSI SRL\nFATTURA N. 48/26\nData 16/10/2026\nVeicolo BMW X1 AB123CD\nTagliando completo\nTotale fattura: € 1.234,56`,vehicles)
    expect(result.supplier).toBe('OFFICINA ROSSI SRL')
    expect(result.amount).toBe(1234.56)
    expect(result.occurredOn).toBe('2026-10-16')
    expect(result.detectedPlate).toBe('AB123CD')
    expect(result.vehicleId).toBe('car-1')
    expect(result.category).toBe('OFFICINA')
    expect(result.confidence).toBeGreaterThanOrEqual(80)
  })

  it('matches a VIN when the plate is absent',()=>{
    const result=parseExpenseText(`AUTORICAMBI BRESCIA\nDocumento 18/26\n12-10-2026\nTelaio WBA12345678901234\nRICAMBI\nTOTALE DOCUMENTO 245,00`,vehicles)
    expect(result.amount).toBe(245)
    expect(result.detectedVin).toBe('WBA12345678901234')
    expect(result.vehicleId).toBe('car-1')
    expect(result.category).toBe('RICAMBI')
  })
})
