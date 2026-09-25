import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
app.use(express.static(__dirname));
app.get("*",(_,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(3000,()=>console.log("ZoltroCloud web on :3000"));
