export function concernExample(hr:boolean){
 const id=hr?'sample-incoming':'sample-my-report';
 const lines=hr?[
 'While handing over a shift, I heard a coworker being singled out. How can I share what happened privately?',
 'Thank you for raising this. You can describe what you observed here without naming the coworker.',
 'It happened during the evening handoff. I can share more details here.'
 ]:[
 'I would like guidance on raising a scheduling concern without discussing it in the team chat.',
 'We can discuss it here. What scheduling change would you like us to review?',
 'I would like more notice when my assigned shift changes.'
 ];
 return {id,sample:true,details:lines[0],scope:hr?'Someone Else':'Myself',affected:'',reportedBy:'',anonymous:true,submitted:'2026-10-01T15:00:00Z',reviewed:null,closed:false,canReply:true,state:'Active',messages:[{at:'2026-10-01T15:10:00Z',by:'HR',text:lines[1]},{at:'2026-10-01T15:15:00Z',by:'Reporter',text:lines[2]}]};
}
