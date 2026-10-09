import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);

function host(text){
  const commands=new Map(),writes=[],messages=[],problems=new Map(),events={};
  let selected=null;
  let statusItem;
  const document={
    uri:{toString:()=>"file:///temp/localization.csv"},
    fileName:"C:\\temp\\localization.csv",
    languageId:"csv",
    version:1,
    getText:()=>text,
    positionAt(offset){
      const before=text.slice(0,offset);
      const line=(before.match(/\n/g)||[]).length;
      const start=before.lastIndexOf("\n")+1;
      return {line,character:offset-start};
    },
    lineAt(line){
      const src=text.split("\n")[line]||"";
      return {range:{end:{line,character:src.replace(/\r$/,"").length}}};
    },
    setText(next){text=next;this.version++;}
  };
  const editor={document,selection:null,revealRange(){}};
  const statusBar={
    show(){this.visible=true;},hide(){this.visible=false;},dispose(){}
  };
  const vscode={
    DiagnosticSeverity:{Error:0,Warning:1},
    StatusBarAlignment:{Right:2},
    TextEditorRevealType:{InCenter:1},
    Position:class{constructor(line,character){this.line=line;this.character=character;}},
    Range:class{constructor(start,end){this.start=start;this.end=end;}},
    Diagnostic:class{
      constructor(range,message,severity){
        this.range=range;this.message=message;this.severity=severity;
      }
    },
    Selection:class{constructor(start,end){this.start=start;this.end=end;}},
    Uri:{
      file:value=>({path:value,toString:()=>value}),
      joinPath:(base,sub)=>({path:base.path+"/"+sub,toString:()=>base.path+"/"+sub}),
    },
    languages:{createDiagnosticCollection:()=>({
      set:(uri,items)=>problems.set(uri.toString(),items),
      delete:uri=>problems.delete(uri.toString()),
      dispose(){},
    })},
    window:{
      activeTextEditor:editor,
      createStatusBarItem:()=>{statusItem=statusBar;return statusBar;},
      showInformationMessage:msg=>{messages.push(["info",msg]);return Promise.resolve();},
      showErrorMessage:msg=>{messages.push(["error",msg]);return Promise.resolve();},
      showWarningMessage:msg=>{messages.push(["warning",msg]);return Promise.resolve();},
      showQuickPick:async items=>{selected=items;return items[0];},
      showTextDocument:async()=>editor,
      showSaveDialog:async()=>({path:"C:\\temp\\report.csv",toString:()=> "file:///temp/report.csv"}),
      onDidChangeActiveTextEditor:callback=>{events.active=callback;return {dispose(){}};},
    },
    workspace:{
      textDocuments:[document],
      getConfiguration:()=>({get:(key,fallback)=>
        key==="sourceLocale"?"en":
        key==="checkOnSave"?true:fallback}),
      fs:{writeFile:async(uri,bytes)=>{writes.push({uri,bytes});}},
      onDidChangeTextDocument:callback=>{events.change=callback;return {dispose(){}};},
      onDidSaveTextDocument:callback=>{events.save=callback;return {dispose(){}};},
      onDidCloseTextDocument:callback=>{events.close=callback;return {dispose(){}};},
      onDidChangeConfiguration:callback=>{events.config=callback;return {dispose(){}};},
    },
    commands:{
      registerCommand:(name,callback)=>{
        commands.set(name,callback);return {dispose(){}};
      }
    },
  };
  return {vscode,commands,problems,events,messages,writes,document,editor,
          get status(){return statusItem;},get choices(){return selected;}};
}

test("VS Code activation runs diagnostics, navigation and CSV export offline",async()=>{
 const h=host("key,en,pl\nwelcome,Hello {name},Czesc {user}\nscore,Score,Wynik");
 const originalLoad=Module._load;
 Module._load=function(request,parent,isMain){
   if(request==="vscode")return h.vscode;
   return originalLoad.call(this,request,parent,isMain);
 };
 let extension;
 try{extension=require("../extension.cjs");}
 finally{Module._load=originalLoad;}
 const subscriptions=[];
 extension.activate({subscriptions});
 assert.equal(h.commands.size,3);
 assert.ok(subscriptions.length>=7);
 assert.equal(h.status.visible,true);
 const output=await h.commands.get("forgeframeLocalization.inspectCsv")();
 assert.ok(output);
 assert.equal(output.blocking,1);
 assert.equal(output.review,0);
 const diags=h.problems.get(h.document.uri.toString());
 assert.equal(diags.length,1);
 assert.equal(diags[0].severity,h.vscode.DiagnosticSeverity.Error);
 assert.equal(diags[0].range.start.line,1);
 assert.match(diags[0].message,/Formatting mismatch/);
 assert.match(h.status.text,/1 CSV issues/);

 await h.commands.get("forgeframeLocalization.showFindings")();
 assert.equal(h.choices.length,1);
 assert.equal(h.editor.selection.start.line,1);

 await h.commands.get("forgeframeLocalization.exportCsv")();
 assert.equal(h.writes.length,1);
 const csv=h.writes[0].bytes.toString("utf8");
 assert.match(csv,/Suggested fix/);
 assert.match(csv,/Formatting mismatch/);

 h.document.setText("key,en,pl\nx,Hello,Czesc");
 h.events.change({document:h.document});
 assert.equal(h.problems.size,0);
 await h.events.save(h.document);
 assert.equal(h.problems.get(h.document.uri.toString()).length,0);
 assert.match(h.status.text,/checks passed/);

 h.events.close(h.document);
 assert.equal(h.problems.size,0);
 extension.deactivate();
});

test("all extension packaging commands are local and no external endpoints are embedded",()=>{
 const manifest=require("../package.json");
 assert.equal(manifest.version,"0.1.0");
 assert.ok(manifest.contributes.commands.length===3);
 assert.ok(manifest.contributes.configuration.properties["forgeframeLocalization.checkOnSave"]);
 const code=require("node:fs").readFileSync(require("node:path").join(import.meta.dirname,"..","extension.cjs"),"utf8");
 for(const term of ["fetch(","https.request(","XMLHttpRequest","telemetry","analytics"]){
   assert.equal(code.includes(term),false,term);
 }
});
