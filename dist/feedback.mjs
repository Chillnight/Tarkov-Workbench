// Author: CA
export function setupFeedback(){
  const dialog=document.createElement('dialog');dialog.id='feedback-dialog';dialog.className='feedback-dialog';dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-labelledby','feedback-title');dialog.setAttribute('aria-describedby','feedback-message');
  const heading=document.createElement('h2');heading.id='feedback-title';
  const message=document.createElement('p');message.id='feedback-message';
  const actions=document.createElement('div');actions.className='update-actions';
  const button=document.createElement('button');button.id='feedback-ok';button.type='button';button.className='primary';button.textContent='Got it';actions.append(button);dialog.append(heading,message,actions);document.body.append(dialog);
  let restore=null;
  button.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{restore?.focus();restore=null;});
  return (title,text,focus=null)=>{heading.textContent=title;message.textContent=text;restore=focus??document.activeElement;if(!dialog.open)dialog.showModal();button.focus();};
}
