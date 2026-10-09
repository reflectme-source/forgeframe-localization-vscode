"use strict";

/** ForgeFrame Labs Localization QA — local-only VS Code extension. */
const vscode=require("vscode");
const path=require("node:path");
const {pathToFileURL}=require("node:url");

const DISPLAY_LIMIT=1500;
let collection;
let badge;
let cached=new Map();
let modelPromise;

function model(){
  if(!modelPromise){
    const uri=pathToFileURL(path.join(__dirname,"lib","report-model.mjs")).href;
    modelPromise=import(uri);
  }
  return modelPromise;
}
function isCsv(document){
  return !!document && (document.languageId==="csv"||
    (typeof document.fileName==="string"&&document.fileName.toLowerCase().endsWith(".csv")));
}
function config(){
  const opts=vscode.workspace.getConfiguration("forgeframeLocalization");
  return {
    sourceLocale:String(opts.get("sourceLocale","en")).trim(),
    checkOnSave:opts.get("checkOnSave",true)===true,
  };
}
function setBadge(editor){
  if(!badge)return;
  if(!editor||!isCsv(editor.document)){
    badge.hide();return;
  }
  const entry=cached.get(editor.document.uri.toString());
  badge.show();
  if(!entry||entry.version!==editor.document.version){
    badge.text="$(search) Check CSV";
    badge.tooltip="ForgeFrame Localization QA: inspect this CSV locally";
    return;
  }
  badge.text=entry.inspected.blocking?
    "$(warning) "+entry.inspected.blocking+" CSV issues":
    entry.inspected.review?"$(info) "+entry.inspected.review+" CSV reviews":
    "$(check) CSV checks passed";
  badge.tooltip=entry.inspected.summary+" Click to inspect again.";
}
function clear(document){
  if(!document)return;
  const key=document.uri.toString();
  cached.delete(key);
  if(collection) collection.delete(document.uri);
  setBadge(vscode.window.activeTextEditor);
}
function diagnosticsFor(document,inspected){
  const all=[];
  for(const issue of inspected.findings.slice(0,DISPLAY_LIMIT)){
    const pos=document.positionAt(issue.offset);
    const end=document.lineAt(pos.line).range.end;
    const range=new vscode.Range(pos,end);
    const diagnostic=new vscode.Diagnostic(
      range,
      issue.title+": "+(issue.details||"Review this entry")+"\nSuggested fix: "+issue.fix,
      issue.severity==="blocking"?
        vscode.DiagnosticSeverity.Error:vscode.DiagnosticSeverity.Warning
    );
    diagnostic.code=issue.code;
    diagnostic.source="ForgeFrame Localization QA";
    all.push(diagnostic);
  }
  return all;
}
async function inspect(document,notify=true){
  if(!isCsv(document)){
    if(notify)void vscode.window.showInformationMessage("Open a CSV localization file to inspect.");
    return null;
  }
  try{
    const options=config();
    const inspected=(await model()).inspectDocumentText(document.getText(),{
      sourceLocale:options.sourceLocale,
    });
    cached.set(document.uri.toString(),{version:document.version,inspected});
    collection.set(document.uri,diagnosticsFor(document,inspected));
    setBadge(vscode.window.activeTextEditor);
    if(notify){
      void vscode.window.showInformationMessage(
        inspected.summary+" Review the Problems panel or browse findings."
      );
    }
    return inspected;
  }catch(error){
    clear(document);
    const note=error instanceof Error?error.message:"Unable to inspect this CSV.";
    if(notify)void vscode.window.showErrorMessage("ForgeFrame Localization QA: "+note);
    return null;
  }
}
async function activeInspection(){
  const active=vscode.window.activeTextEditor;
  if(!active||!isCsv(active.document)){
    void vscode.window.showInformationMessage("Open a localization CSV first.");
    return null;
  }
  const key=active.document.uri.toString();
  const data=cached.get(key);
  if(data&&data.version===active.document.version){
    return {document:active.document,inspected:data.inspected};
  }
  const inspected=await inspect(active.document,false);
  return inspected?{document:active.document,inspected}:null;
}
async function browseFindings(){
  const data=await activeInspection();
  if(!data)return;
  const findings=data.inspected.findings;
  if(!findings.length){
    void vscode.window.showInformationMessage("No structural localization issues found.");
    return;
  }
  const items=findings.slice(0,DISPLAY_LIMIT).map(issue=>({
    label:(issue.severity==="blocking"?"$(error) ":"$(warning) ")+issue.title,
    description:"row "+issue.row+" · "+(issue.key||"unnamed key")+" · "+(issue.locale||"CSV"),
    detail:"Fix: "+issue.fix,
    issue,
  }));
  const choice=await vscode.window.showQuickPick(items,{
    title:"Localization findings",
    placeHolder:"Select a finding to jump to its CSV row",
    matchOnDescription:true,
    matchOnDetail:true,
  });
  if(!choice)return;
  const current=vscode.workspace.textDocuments.find(
    d=>d.uri.toString()===data.document.uri.toString()
  );
  if(!current||current.version!==data.document.version){
    void vscode.window.showWarningMessage("CSV changed. Inspect again before navigating.");
    return;
  }
  const editor=await vscode.window.showTextDocument(data.document,{preview:false});
  const pos=data.document.positionAt(choice.issue.offset);
  editor.selection=new vscode.Selection(pos,pos);
  editor.revealRange(new vscode.Range(pos,pos),vscode.TextEditorRevealType.InCenter);
}
async function exportCsv(){
  const data=await activeInspection();
  if(!data)return;
  const basename=path.basename(data.document.fileName||"localization.csv").replace(/\.csv$/i,"");
  const pathForSave=await vscode.window.showSaveDialog({
    defaultUri:vscode.Uri.joinPath(
      vscode.Uri.file(path.dirname(data.document.fileName||process.cwd())),
      basename+".qa-report.csv"
    ),
    filters:{"CSV report":["csv"]},
    saveLabel:"Export localization findings",
  });
  if(!pathForSave)return;
  const output=(await model()).csvFromInspection(data.inspected);
  try{
    await vscode.workspace.fs.writeFile(pathForSave,Buffer.from(output,"utf8"));
    void vscode.window.showInformationMessage("Localization report exported.");
  }catch(error){
    void vscode.window.showErrorMessage(
      "Unable to save localization report: "+
        (error instanceof Error?error.message:"Unknown error")
    );
  }
}
function activate(context){
  collection=vscode.languages.createDiagnosticCollection("ForgeFrame Localization QA");
  badge=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,100);
  badge.command="forgeframeLocalization.inspectCsv";
  badge.tooltip="Inspect localization CSV offline";
  context.subscriptions.push(collection,badge,
    vscode.commands.registerCommand("forgeframeLocalization.inspectCsv",()=>{
      return inspect(vscode.window.activeTextEditor?.document);
    }),
    vscode.commands.registerCommand("forgeframeLocalization.showFindings",browseFindings),
    vscode.commands.registerCommand("forgeframeLocalization.exportCsv",exportCsv),
    vscode.window.onDidChangeActiveTextEditor(setBadge),
    vscode.workspace.onDidChangeTextDocument(event=>{
      if(isCsv(event.document))clear(event.document);
    }),
    vscode.workspace.onDidSaveTextDocument(async document=>{
      if(isCsv(document)&&config().checkOnSave)await inspect(document,false);
    }),
    vscode.workspace.onDidCloseTextDocument(clear),
    vscode.workspace.onDidChangeConfiguration(event=>{
      if(event.affectsConfiguration("forgeframeLocalization")){
        for(const doc of vscode.workspace.textDocuments) if(isCsv(doc))clear(doc);
      }
    })
  );
  setBadge(vscode.window.activeTextEditor);
}

function deactivate(){
  cached.clear();
}

module.exports={activate,deactivate};
