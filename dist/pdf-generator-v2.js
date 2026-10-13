/* Générateur PDF complet - version 2, nom distinct pour les caches mobiles. */
(function(){
  'use strict';

  const C={header:[255,241,199],green:[226,241,218],purple:[241,228,255],peach:[254,233,217],cream:[242,242,223],gray:[238,238,238],blue:[216,240,245]};
  const safe=v=>String(v??'').replace(/[–—]/g,'-').replace(/[’]/g,"'").replace(/•/g,'-').replace(/\s+/g,' ').trim();
  const filename=v=>safe(v||'fiche-activite').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()+'.pdf';
  let jsPdfLoading;

  function loadJsPdf(){
    if(window.jspdf?.jsPDF)return Promise.resolve(window.jspdf.jsPDF);
    if(jsPdfLoading)return jsPdfLoading;
    jsPdfLoading=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='jspdf.umd.min.js';
      script.onload=()=>window.jspdf?.jsPDF?resolve(window.jspdf.jsPDF):reject(new Error('Le moteur PDF n’a pas pu démarrer.'));
      script.onerror=()=>reject(new Error('Le moteur PDF est indisponible. Vérifiez la connexion puis réessayez.'));
      document.head.appendChild(script);
    });
    return jsPdfLoading;
  }

  function lines(doc,text,width,size,max){
    doc.setFontSize(size);
    const out=doc.splitTextToSize(safe(text)||'-',Math.max(5,width));
    if(out.length<=max)return out;
    const clipped=out.slice(0,max);
    clipped[max-1]=clipped[max-1].replace(/[.,;:]?$/,'...');
    return clipped;
  }
  function textBlock(doc,text,x,y,w,h,size=6.2,bold=false,center=false){
    doc.setFont('helvetica',bold?'bold':'normal');doc.setTextColor(20,20,20);doc.setFontSize(size);
    const leading=size*.36+1.05,max=Math.max(1,Math.floor((h-2.2)/leading));
    const ls=lines(doc,text,w-3,size,max);
    doc.text(ls,center?x+w/2:x+1.5,y+2.7,{align:center?'center':'left',baseline:'top',lineHeightFactor:1.12});
  }
  function rect(doc,x,y,w,h,fill){
    doc.setDrawColor(20);doc.setLineWidth(.3);
    if(fill){doc.setFillColor(...fill);doc.rect(x,y,w,h,'FD')}else doc.rect(x,y,w,h,'S');
  }
  function titledBox(doc,x,y,w,h,title,content,fill,options={}){
    rect(doc,x,y,w,h,fill);doc.setLineWidth(.25);doc.line(x,y+5.5,x+w,y+5.5);
    doc.setFont('helvetica','normal');doc.setFontSize(6.2);doc.setTextColor(20);doc.text(safe(title),x+w/2,y+3.6,{align:'center'});
    textBlock(doc,content,x,y+5.5,w,h-5.5,options.size||6.1,!!options.bold,!!options.center);
  }
  function activityTasksBox(doc,x,y,w,h,groups,tasks){
    rect(doc,x,y,w,h);doc.setLineWidth(.25);doc.line(x,y+5.5,x+w,y+5.5);
    doc.setFont('helvetica','normal');doc.setFontSize(6.2);doc.setTextColor(20);doc.text('Activités / Tâches',x+w/2,y+3.6,{align:'center'});
    const entries=groups.length?groups.map(item=>({title:`${item.group.id} : ${item.group.label}`,ids:item.tasks.map(t=>t.id)})):(tasks.length?[{title:'Tâches sélectionnées',ids:tasks.map(t=>t.id)}]:[]);
    if(!entries.length){textBlock(doc,'Non renseignées',x,y+5.5,w,h-5.5,5.8,true);return;}
    let fontSize=5.5,totalLines=0,prepared=[];
    const prepare=()=>{prepared=entries.map(entry=>{const title=doc.splitTextToSize(safe(entry.title),w-3),ids=doc.splitTextToSize(`${entry.ids.join(', ')}.`,w-8);return{title,ids}});totalLines=prepared.reduce((n,item)=>n+item.title.length+item.ids.length,0)};
    doc.setFontSize(fontSize);prepare();
    const available=h-8.5;
    fontSize=Math.max(4,Math.min(5.5,(available/Math.max(1,totalLines))/(.36+1.25/fontSize)));
    doc.setFontSize(fontSize);prepare();
    const leading=fontSize*.36+1.15;let cy=y+9;
    prepared.forEach((entry,index)=>{
      doc.setFont('helvetica','bold');doc.text(entry.title,x+1.7,cy,{lineHeightFactor:1.12});cy+=entry.title.length*leading;
      doc.setFont('helvetica','normal');doc.text(entry.ids,x+6,cy,{lineHeightFactor:1.12});cy+=entry.ids.length*leading+(index<prepared.length-1?1.2:0);
    });
  }
  function selectedData(a){
    const comps=(a.competencies||[]).map(id=>MELEC.competencies.find(c=>c.id===id)).filter(Boolean);
    const storedSelections=a.taskSelections&&typeof a.taskSelections==='object'?a.taskSelections:{};
    const selections={};
    comps.forEach(c=>{
      const stored=Array.isArray(storedSelections[c.id])?storedSelections[c.id]:[];
      const fallback=(a.tasks||[]).filter(tid=>(MELEC.links?.[tid]||{})[c.id]);
      selections[c.id]=[...new Set(stored.length?stored:fallback)];
    });
    const taskIds=[...new Set([...(a.tasks||[]),...Object.values(selections).flat()])];
    const tasks=taskIds.map(id=>MELEC.tasks.find(t=>t.id===id)).filter(Boolean);
    const activityGroups=(MELEC.activities||[]).map(group=>({group,tasks:tasks.filter(t=>t.activity===group.id)})).filter(x=>x.tasks.length);
    const criterionKeys=[...new Set([...(a.criteria||[]),...Object.values(a.criterionSelections||{}).flat()])];
    const criteria=[];
    comps.forEach(c=>criterionKeys.filter(k=>k.startsWith(c.id+':')).forEach(k=>{const label=c.criteria[Number(k.split(':')[1])];if(label)criteria.push(label)}));
    const knowledge=[...new Set(comps.flatMap(c=>c.knowledge||[]))].map(k=>MELEC.knowledge[k]||k);
    const attitudes=[...new Set(comps.flatMap(c=>c.attitudes||[]))];
    const autonomy=[...new Set(tasks.map(t=>t.autonomy).filter(Boolean))].join(' / ')||'Selon les tâches sélectionnées';
    return {comps,selections,tasks,taskIds,activityGroups,criterionKeys,criteria,knowledge,attitudes,autonomy};
  }

  function addSelectionAnnex(doc,a,d){
    const margin=12,pageBottom=282,width=186;
    let y=0;
    const newPage=()=>{
      doc.addPage('a4','portrait');y=13;
      doc.setTextColor(20);doc.setFont('helvetica','bold');doc.setFontSize(13);
      doc.text("Détail complet de l'activité",margin,y);y+=6;
      doc.setFont('helvetica','normal');doc.setFontSize(7.5);
      doc.text(`${safe(a.title)} - ${safe(a.className)} - ${safe(a.date)}`,margin,y,{maxWidth:width});y+=8;
      doc.setDrawColor(40,70,120);doc.setLineWidth(.35);doc.line(margin,y-3,margin+width,y-3);
    };
    const ensure=height=>{if(y+height>pageBottom)newPage()};
    const writeWrapped=(text,x,availableWidth,size=7.5,bold=false,indent=0)=>{
      doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(25);
      const wrapped=doc.splitTextToSize(safe(text)||'-',availableWidth-indent);
      const height=Math.max(4,wrapped.length*(size*.36+1.25));ensure(height+1);
      doc.text(wrapped,x+indent,y,{lineHeightFactor:1.18});y+=height;
    };
    newPage();
    const studentIds=new Set(a.studentIds||[]),studentNames=state.students.filter(s=>studentIds.has(s.id)).map(s=>s.name);
    ensure(13);doc.setFillColor(238,243,255);doc.roundedRect(margin,y,width,11,2,2,'F');
    writeWrapped(`Élève(s) concerné(s) : ${studentNames.join(', ')||'Non renseigné(s)'}`,margin+2,width-4,7.2,true);y+=3;
    d.comps.forEach(c=>{
      doc.setFont('helvetica','bold');doc.setFontSize(9);
      const competenceLines=doc.splitTextToSize(`${safe(c.id)} - ${safe(c.unit)} - ${safe(c.label)}`,width-6),competenceHeight=Math.max(10,competenceLines.length*4.2+4);
      ensure(competenceHeight+6);doc.setFillColor(216,240,245);doc.roundedRect(margin,y,width,competenceHeight,2,2,'F');
      doc.text(competenceLines,margin+3,y+4.2,{lineHeightFactor:1.15,baseline:'top'});y+=competenceHeight+4;
      let tids=d.selections[c.id]||[];
      if(!tids.length)tids=d.taskIds.filter(tid=>(MELEC.links?.[tid]||{})[c.id]);
      if(!tids.length){writeWrapped('Aucune tâche sélectionnée pour cette compétence.',margin,width,7.2,false,3);y+=3;return;}
      tids.forEach(tid=>{
        const task=MELEC.tasks.find(t=>t.id===tid);
        ensure(11);writeWrapped(`${tid} - ${task?.label||tid}${task?.autonomy?` (autonomie ${task.autonomy.toLowerCase()})`:''}`,margin,width,8,true,3);
        const stored=a.criterionSelections?.[tid];
        const keys=(Array.isArray(stored)&&stored.length?stored:d.criterionKeys).filter(key=>key.startsWith(c.id+':'));
        if(keys.length){keys.forEach(key=>{const label=c.criteria?.[Number(key.split(':')[1])]||'Critère non retrouvé';writeWrapped(`• ${label}`,margin,width,7.3,false,8)})}
        else writeWrapped('• Aucun critère sélectionné pour cette tâche.',margin,width,7.2,false,8);
        y+=3;
      });
    });
    ensure(18);doc.setFillColor(242,242,223);doc.roundedRect(margin,y,width,9,2,2,'F');doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.text('Connaissances mobilisées',margin+3,y+5.8);y+=13;
    d.knowledge.forEach(item=>writeWrapped(`• ${item}`,margin,width,7.2,false,4));
    ensure(16);y+=3;doc.setFillColor(254,233,217);doc.roundedRect(margin,y,width,9,2,2,'F');doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.text('Attitudes professionnelles',margin+3,y+5.8);y+=13;
    writeWrapped(d.attitudes.join(' - ')||'Non renseignées',margin,width,7.2,false,4);
  }

  async function generateActivityPdf(id){
    try{
      const a=state.activities.find(x=>x.id===id);if(!a)throw new Error('Activité introuvable');
      const jsPDF=await loadJsPdf(),doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
      const d=selectedData(a),x=7,y0=7,w=196,col=w/4;
      doc.setProperties({title:`Fiche d'activité - ${safe(a.title)}`,subject:'BAC PRO MELEC',author:'BAC PRO MELEC',creator:'Application BAC PRO MELEC'});

      let y=y0;
      const hHeader=25,hFour=36,hPre=34,hDesc=43,hDossiers=68,hResults=55,hFooter=15;
      rect(doc,x,y,w,hHeader,C.header);doc.line(x+3*col,y,x+3*col,y+hHeader);
      doc.setFont('helvetica','bold');doc.setFontSize(10.5);doc.text('BAC PRO MELEC - Métiers de l’Électricité et de ses Environnements Connectés',x+3,y+6,{maxWidth:3*col-6});
      doc.setFontSize(6.8);doc.text(`Titre : ${safe(a.title)||'-'}`,x+3,y+13,{maxWidth:3*col-6});doc.text(`Activité : ${safe(a.situation||'Situation professionnelle')}`,x+3,y+18,{maxWidth:3*col-6});
      if(a.audience==='students'){
        const ids=new Set(a.studentIds||[]),names=state.students.filter(s=>ids.has(s.id)).map(s=>s.name).join(', ');
        doc.setFont('helvetica','normal');doc.setFontSize(5.2);doc.text(`Élève(s) : ${safe(names)||'-'}`,x+3,y+22.5,{maxWidth:3*col-6});
      }
      doc.setFontSize(6.6);doc.text([`Niveau : ${safe(a.className||'-')}`,`Date : ${safe(a.date||'-')}`,'Durée : -'],x+3*col+3,y+6,{lineHeightFactor:1.55});y+=hHeader;

      const sectors=typeof activitySectors==='function'?activitySectors(a).join(' - '):'';
      titledBox(doc,x,y,col,hFour,'Moyens et ressources',a.resources||'Non renseignés',null);
      titledBox(doc,x+col,y,col,hFour,'Autonomie et responsabilité',`${d.autonomy}. Responsabilité des moyens et du résultat selon les tâches.`,null);
      titledBox(doc,x+2*col,y,col,hFour,"Élément d'environnement","Situation réelle ou simulée sur tout ou partie d'une installation.",null);
      rect(doc,x+3*col,y,col,hFour);doc.line(x+3*col,y+5.5,x+w,y+5.5);doc.line(x+3*col,y+18,x+w,y+18);
      doc.setFont('helvetica','normal');doc.setFontSize(6.2);doc.text("Secteur d'activité",x+3.5*col,y+3.6,{align:'center'});textBlock(doc,sectors||'Non renseigné',x+3*col,y+5.5,col,12.5,5.8);
      doc.text('Attitudes professionnelles',x+3.5*col,y+21.7,{align:'center'});doc.setFont('helvetica','bold');doc.setFontSize(6.2);doc.text(d.attitudes.join('   ')||'-',x+3.5*col,y+28,{align:'center',maxWidth:col-3});y+=hFour;

      titledBox(doc,x,y,3*col,hPre,'Prérequis','Connaissances et savoir-faire nécessaires à la réalisation de la situation professionnelle.',C.green);
      activityTasksBox(doc,x+3*col,y,col,hPre,d.activityGroups,d.tasks);y+=hPre;

      titledBox(doc,x,y,w,hDesc,'Description',a.context||'Non renseignée',C.purple,{size:6.4});y+=hDesc;

      const compW=col,dossierW=col;
      titledBox(doc,x,y,dossierW,hDossiers,'Dossier 1',a.resources||"Ressources techniques de l'activité",null,{size:5.8});
      titledBox(doc,x+dossierW,y,dossierW,hDossiers,'Dossier 2',"Documents, schémas et supports associés à l'activité.",null,{size:5.8});
      titledBox(doc,x+2*dossierW,y,dossierW,hDossiers,'Dossier 3','Documents liés à la prévention des risques professionnels.',null,{size:5.8});
      const mx=x+3*col;rect(doc,mx,y,compW,hDossiers,C.gray);doc.line(mx,y+5.5,mx+compW,y+5.5);doc.setFont('helvetica','normal');doc.setFontSize(6.2);doc.text('Compétences',mx+compW/2,y+3.6,{align:'center'});
      const rows=MELEC.competencies||[],rh=(hDossiers-5.5)/(rows.length+1),c1=14,c2=15;
      doc.setFontSize(5.5);doc.setFont('helvetica','bold');doc.text('COMP.',mx+c1/2,y+5.5+rh*.68,{align:'center'});doc.text('UNITÉ',mx+c1+c2/2,y+5.5+rh*.68,{align:'center'});doc.text('X',mx+c1+c2+(compW-c1-c2)/2,y+5.5+rh*.68,{align:'center'});
      for(let i=0;i<=rows.length;i++){const yy=y+5.5+i*rh;doc.line(mx,yy,mx+compW,yy)}doc.line(mx+c1,y+5.5,mx+c1,y+hDossiers);doc.line(mx+c1+c2,y+5.5,mx+c1+c2,y+hDossiers);
      rows.forEach((c,i)=>{const top=y+5.5+(i+1)*rh,yy=top+rh*.68,sel=d.comps.some(v=>v.id===c.id);if(sel){doc.setFillColor(...C.blue);doc.rect(mx+.2,top+.2,compW-.4,rh-.4,'F')}doc.setTextColor(20);doc.setFont('helvetica','normal');doc.setFontSize(5.4);doc.text(c.id,mx+c1/2,yy,{align:'center'});doc.text(c.unit||'-',mx+c1+c2/2,yy,{align:'center'});if(sel){doc.setFont('helvetica','bold');doc.text('X',mx+c1+c2+(compW-c1-c2)/2,yy,{align:'center'})}});for(let i=0;i<=rows.length+1;i++){const yy=y+5.5+i*rh;doc.line(mx,yy,mx+compW,yy)}doc.line(mx+c1,y+5.5,mx+c1,y+hDossiers);doc.line(mx+c1+c2,y+5.5,mx+c1+c2,y+hDossiers);y+=hDossiers;

      const half=w/2;
      rect(doc,x,y,half,hResults,C.peach);rect(doc,x+half,y,half,hResults,C.cream);doc.line(x,y+5.5,x+w,y+5.5);
      doc.setFont('helvetica','normal');doc.setFontSize(6.2);doc.text('Résultats attendus',x+half/2,y+3.6,{align:'center'});doc.text('Connaissances et natures',x+half+half/2,y+3.6,{align:'center'});
      textBlock(doc,d.criteria.map(v=>'- '+v).join('\n')||'Non renseignés',x+2,y+6,half-4,hResults-7,5.8);
      textBlock(doc,d.knowledge.map(v=>'- '+v).join('\n')||'Non renseignées',x+half+2,y+6,half-4,hResults-7,5.8);y+=hResults;

      rect(doc,x,y,w,hFooter);const f1=55,f3=23;doc.line(x+f1,y,x+f1,y+hFooter);doc.line(x+w-f3,y,x+w-f3,y+hFooter);
      textBlock(doc,`BAC PRO MELEC\n${safe(a.className||'')}`,x,y,f1,hFooter,6.5,true,true);
      textBlock(doc,`FICHE D'ACTIVITÉ\n${safe(a.title)}`,x+f1,y,w-f1-f3,hFooter,6.5,true,true);
      textBlock(doc,'1 / 1',x+w-f3,y,f3,hFooter,7,true,true);

      const name=filename(a.title),blob=doc.output('blob'),file=new File([blob],name,{type:'application/pdf'});
      if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:`Fiche d'activité - ${a.title}`,files:[file]})}
      else doc.save(name);
      if(typeof toast==='function')toast('PDF A4 généré avec succès.');
    }catch(error){console.error(error);if(typeof toast==='function')toast(error.message||'Impossible de générer le PDF.');else alert(error.message)}
  }

  window.generateActivityPdf=generateActivityPdf;
  window.printActivity=generateActivityPdf;
})();
