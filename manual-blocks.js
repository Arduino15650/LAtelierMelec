(function () {
  'use strict';
  // Le contenu reste dans manual_sections.content_html : aucune migration SQL.
  const token=/\[\[(image|pdf):([0-9a-f-]{36})(?:\|(left|center|right|free)\|(\d{1,3})(?:\|(\d{1,3})\|(\d{1,5}))?)?\]\]/gi;
  const clamp=value=>Math.max(1,Math.min(100,Number(value)||100));
  function align(value,x){
    if(value!=='free')return ['left','center','right'].includes(value)?value:'center';
    return Number(x)<30?'left':Number(x)>60?'right':'center';
  }
  function split(node){
    if(node.nodeType===Node.TEXT_NODE){
      const value=node.textContent,parts=[];let start=0,match;
      token.lastIndex=0;
      while((match=token.exec(value))){
        if(match.index>start)parts.push({type:'node',node:document.createTextNode(value.slice(start,match.index))});
        parts.push({type:match[1].toLowerCase(),id:match[2].toLowerCase(),align:align(match[3],match[5]),width:clamp(match[4])});
        start=token.lastIndex;
      }
      if(start<value.length)parts.push({type:'node',node:document.createTextNode(value.slice(start))});
      return parts;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return[];
    if(!node.childNodes.length)return[{type:'node',node:node.cloneNode(false)}];
    const parts=[];let copy=node.cloneNode(false);
    copy.removeAttribute('data-manual-continuation');copy.style.removeProperty('margin-top');
    for(const child of [...node.childNodes])for(const part of split(child)){
      if(part.type==='node')copy.append(part.node);
      else{
        if(copy.hasChildNodes())parts.push({type:'node',node:copy});
        parts.push(part);copy=node.cloneNode(false);
        copy.removeAttribute('data-manual-continuation');copy.style.removeProperty('margin-top');
      }
    }
    if(copy.hasChildNodes())parts.push({type:'node',node:copy});
    return parts;
  }
  function parse(html,files=[]){
    const root=new DOMParser().parseFromString(window.MelecContent.sanitize(html||''),'text/html').body;
    const blocks=[],buffer=[],used=new Set();
    const flush=()=>{
      if(!buffer.length)return;
      const host=document.createElement('div');host.append(...buffer.splice(0));
      const clean=window.MelecContent.sanitize(host.innerHTML);
      if(host.textContent.trim()||host.querySelector('table,iframe,img,br'))blocks.push({type:'text',html:clean});
    };
    for(const child of [...root.childNodes])for(const part of split(child)){
      if(part.type==='node')buffer.push(part.node);
      else{flush();blocks.push(part);used.add(part.id);}
    }
    flush();
    for(const file of files)if(file.mime_type==='application/pdf'&&!used.has(file.id))blocks.push({type:'pdf',id:file.id});
    if(!blocks.length)blocks.push({type:'text',html:'<p><br></p>'});
    return blocks;
  }
  function serialize(blocks){
    return blocks.map(block=>{
      if(block.type==='text')return window.MelecContent.sanitize(block.html||'');
      if(!/^[0-9a-f-]{36}$/i.test(block.id||''))return'';
      if(block.type==='image')return `<p>[[image:${block.id}|${align(block.align)}|${clamp(block.width)}]]</p>`;
      if(block.type==='pdf')return `<p>[[pdf:${block.id}]]</p>`;
      return'';
    }).join('');
  }
  window.MelecManualBlocks={parse,serialize,clamp,align};
})();
