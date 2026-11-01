type Person={name:string|null;email:string|null};
export function posAttribution<T extends {cashier:Person|null;terminalId:string|null;shift:{user:Person;terminalId:string}|null}>(row:T) {
 const cashier=row.cashier??row.shift?.user??null;
 const terminalId=row.terminalId??row.shift?.terminalId??"";
 // The legacy response field keeps older already-open pages readable; it is not a live shift.
 return {...row,cashier,terminalId,shift:{user:cashier??{name:null,email:null},terminalId}};
}
