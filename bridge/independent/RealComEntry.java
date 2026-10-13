// Initialize the explicit flat COM load at its DOS entry offset before analysis.
// @category Independent
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;

public class RealComEntry extends GhidraScript {
  public void run() throws Exception {
    if (!currentProgram.getLanguageID().toString().equals("x86:LE:16:Real Mode"))
      throw new IllegalArgumentException("COM initializer requires the selected 16-bit language");
    Address entry = toAddr(0x100);
    if (!currentProgram.getMemory().contains(entry))
      throw new IllegalArgumentException("COM entry is outside imported memory");
    addEntryPoint(entry);
    disassemble(entry);
    createFunction(entry, "entry");
  }
}
