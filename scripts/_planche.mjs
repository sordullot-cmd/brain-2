import sharp from 'sharp'
import fs from 'node:fs'
const v = JSON.parse(fs.readFileSync('public/vault.json','utf8'))
const byId = Object.fromEntries(v.media.map(m=>[m.id,m]))
const W=300,H=225,COLS=5
const items=v.projects.map(p=>({p,c:byId[p.cover]})).filter(x=>x.c)
const rows=Math.ceil(items.length/COLS)
const tiles=[]
for(let i=0;i<items.length;i++){
  const {p,c}=items[i]
  const plein=p.coverFit==='cover'
  const pad=plein?4:34
  const src='public'+(c.thumb||c.url)
  const buf=await sharp(src).resize(W-2*pad,H-2*pad,{fit:plein?'cover':'contain',background:{r:242,g:242,b:240}}).toBuffer()
  tiles.push({input:buf,left:(i%COLS)*W+pad,top:Math.floor(i/COLS)*H+pad})
}
await sharp({create:{width:COLS*W,height:rows*H,channels:3,background:'#f2f2f0'}})
  .composite(tiles).jpeg({quality:82}).toFile('/private/tmp/claude-501/-Users-account-Documents-GitHub-vault-gallery/35187b50-0aea-43af-8786-5ef259acf63d/scratchpad/final.jpg')
console.log(items.map((x,i)=>`${i+1}. ${x.p.title}`).join(' · '))
