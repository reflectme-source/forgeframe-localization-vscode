import test from "node:test";
import assert from "node:assert/strict";
import {logicalRowOffsets,inspectDocumentText,csvFromInspection,MAX_CSV_BYTES} from "../lib/report-model.mjs";

test("simple CSV rows map to correct physical start offsets",()=>{
 const text="key,en,pl\nhello,Hello,Cześć\nscore,Score,Wynik";
 const start=logicalRowOffsets(text);
 assert.deepEqual(start,[0,10,28]);
});
test("UTF-8 BOM is included in VS Code UTF-16 offset alignment",()=>{
 const text="\uFEFFkey,en,pl\r\nhello,Hello,Czesc";
 const offsets=logicalRowOffsets(text);
 assert.equal(offsets[0],0);
 assert.equal(text.slice(offsets[1],offsets[1]+5),"hello");
});
test("quoted newline does not shift logical row to wrong physical line",()=>{
 const text='key,en,pl\nquote,"First line\nSecond line","Pierwsza"\nnext,Hello,';
 const offsets=logicalRowOffsets(text);
 assert.equal(offsets.length,3);
 assert.equal(text.slice(offsets[2],offsets[2]+5),"next,");
 const r=inspectDocumentText(text);
 assert.equal(r.findings.length,1);
 assert.equal(r.findings[0].row,3);
 assert.equal(r.findings[0].offset,offsets[2]);
});
test("escaped quotation marks do not break row mapping",()=>{
 const text='key,en,pl\nquote,"Say ""hi""","Powiedz ""hej"""\nnext,Yes,';
 const starts=logicalRowOffsets(text);
 assert.equal(starts.length,3);
 assert.equal(text.slice(starts[2],starts[2]+4),"next");
});
test("CRLF and CR newline handling",()=>{
 assert.deepEqual(logicalRowOffsets("a\r\nb\rc\nd"),[0,3,5,7]);
});
test("valid document reports no issues",()=>{
 const r=inspectDocumentText("key,en,pl\nhello,Hello,Cześć\nscore,Score,Wynik");
 assert.equal(r.blocking,0);
 assert.equal(r.review,0);
 assert.equal(r.report.summary.uniqueKeys,2);
 assert.equal(r.findings.length,0);
});
test("placeholder issue is blocking and maps to the correct row",()=>{
 const txt="key,en,pl\nwelcome,Welcome {name},Witaj {user}";
 const r=inspectDocumentText(txt);
 assert.equal(r.blocking,1);
 assert.equal(r.review,0);
 assert.equal(r.findings[0].title,"Formatting mismatch");
 assert.equal(txt.slice(r.findings[0].offset,r.findings[0].offset+7),"welcome");
 assert.match(r.findings[0].fix,/same variables/);
});
test("multiple issue types and review warnings remain separate",()=>{
 const csv='key,en,pl\nnotice,"{count, plural, one{x} other{y}}","{count, plural, one{x} other{y}}"\nmissing,Continue,';
 const r=inspectDocumentText(csv);
 assert.ok(r.review>=1);
 assert.ok(r.blocking>=1);
 assert.ok(r.summary.includes("blocking"));
});
test("blocks >2MB by UTF-8 byte length rather than characters",()=>{
 assert.equal(MAX_CSV_BYTES,2097152);
 const header="key,en,pl\nx,Ok,";
 const txt=header+"ż".repeat(1048580);
 assert.ok(txt.length<MAX_CSV_BYTES);
 assert.throws(()=>inspectDocumentText(txt),/exceeds 2 MB/);
});
test("invalid CSV first column and source locale fail safely",()=>{
 assert.throws(()=>inspectDocumentText("word,en,pl\nhello,Hi,Czesc"),/First column/);
 assert.throws(()=>inspectDocumentText("key,en,pl\nx,Hi,Czesc",{sourceLocale:"xy-xz?"}),/Invalid source locale/);
});
test("CSV export is actionable and formula injection safe",()=>{
 const r=inspectDocumentText("key,en,pl\n=1+1,Hello {name},Czesc {user}");
 const report=csvFromInspection(r);
 assert.match(report,/Formatting mismatch/);
 assert.match(report,/Suggested fix/);
 assert.ok(report.includes('"\'=1+1"'));
});
test("no actual profit or payout terminology is encoded in report results",()=>{
 const r=inspectDocumentText("key,en,pl\nx,Hi,");
 assert.equal(r.blocking,1);
 assert.equal("paid" in r,false);
 assert.equal("settlement" in r,false);
});
