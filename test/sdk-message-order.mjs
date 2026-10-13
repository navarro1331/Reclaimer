// Preserve received wire order while the installed SDK defers notification callbacks.
// This fixture adapter does not alter, synthesize or omit protocol messages.
export function orderedSdkDelivery(transport){
 const receive=transport.onmessage;
 if(typeof receive!=='function')throw new Error('Connect the owned SDK transport before ordering delivery');
 let pending=Promise.resolve();
 transport.onmessage=(message,extra)=>{
  pending=pending.then(()=>receive(message,extra));
  // Attach a rejection observer; the drain still rejects and fails the fixture.
  pending.catch(error=>transport.onerror?.(error));
 };
 return ()=>pending;
}
