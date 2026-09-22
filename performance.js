(function(){
  'use strict';
  let excelLoading;
  function loadExcelLibrary(){
    if(window.XLSX)return Promise.resolve(window.XLSX);
    if(excelLoading)return excelLoading;
    excelLoading=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='xlsx.full.min.js';
      script.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error('Le lecteur Excel n’a pas pu démarrer.'));
      script.onerror=()=>reject(new Error('Le lecteur Excel est indisponible.'));
      document.head.appendChild(script);
    });
    return excelLoading;
  }
  const originalExcelImport=window.handleExcelImport;
  window.handleExcelImport=handleExcelImport=async function(event){
    const status=document.querySelector('#excelStatus');
    if(status)status.textContent='Chargement du lecteur Excel…';
    try{await loadExcelLibrary();return originalExcelImport(event)}
    catch(error){if(status){status.textContent=error.message;status.classList.add('error-text')}event.target.value=''}
  };
})();
