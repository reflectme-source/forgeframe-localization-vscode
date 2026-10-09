import {inspectLocalizationCsv} from "./localization-core.mjs";
import {issuePresentation,exportIssuesCsv} from "./report-export.mjs";

export const MAX_CSV_BYTES=2*1024*1024;

/**
 * Compute the first physical character offset of each logical CSV row.
 * Quoted newlines are ignored because they belong to the same CSV record.
 * Character offsets use JavaScript UTF-16 indices, matching VS Code documents.
 */
export function logicalRowOffsets(text) {
  if(typeof text!=="string") throw new TypeError("CSV must be text");
  const starts=[0];
  let quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(char==='"'){
      if(quoted&&text[i+1]==='"'){i++;continue;}
      quoted=!quoted;
      continue;
    }
    if(!quoted&&(char==='\n'||char==='\r')){
      if(char==='\r'&&text[i+1]==='\n')i++;
      if(i+1<text.length)starts.push(i+1);
    }
  }
  return starts;
}

export function inspectDocumentText(text,{sourceLocale="en",maxBytes=MAX_CSV_BYTES}={}){
  if(typeof text!=="string")throw new TypeError("CSV text required");
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new RangeError("Invalid size limit");
  if(Buffer.byteLength(text,"utf8")>maxBytes){
    throw new RangeError("CSV exceeds 2 MB. Split large tables before analyzing.");
  }
  const report=inspectLocalizationCsv(text,{sourceLocale});
  const rowStarts=logicalRowOffsets(text);
  const findings=report.findings.map(item=>{
    const presentation=issuePresentation(item);
    return {
      ...item,
      offset:rowStarts[Math.max(0,item.row-1)] ?? text.length,
      severity:presentation.severity,
      title:presentation.title,
      fix:presentation.fix,
    };
  });
  const blocking=findings.filter(item=>item.severity==="blocking").length;
  const review=findings.length-blocking;
  return {
    report,findings,blocking,review,
    summary:String(report.summary.totalRows)+" CSV rows: "+blocking+
      " blocking, "+review+" to review."
  };
}

export function csvFromInspection(inspected) {
  if(!inspected||!inspected.report)throw new TypeError("Invalid inspection");
  return exportIssuesCsv(inspected.report);
}
