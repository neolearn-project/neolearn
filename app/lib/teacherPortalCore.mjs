import { StudentLoginError } from './studentLoginCore.mjs';
export const TEACHER_MEDIA = {photo:{types:['image/jpeg','image/png'],max:2*1024*1024},certificate:{types:['application/pdf','image/jpeg','image/png'],max:5*1024*1024},demo:{types:['video/mp4','video/webm'],max:50*1024*1024}};
export function validateTeacherMedia(kind,type,size){
 const rule=TEACHER_MEDIA[kind];
 if(!rule||!rule.types.includes(type)||!Number.isSafeInteger(size)||size<1||size>rule.max)throw new StudentLoginError('Choose a supported file within the upload limit.');
 return {kind,type,size};
}
export function normalizeTeacherProfile(input){
 const text=(key,max,required=true)=>{const value=input[key];if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new StudentLoginError(`Check ${key}.`);return value.trim();};
 const list=(key,allowed)=>{const v=input[key];if(!Array.isArray(v)||!v.length||v.length>20||v.some(x=>typeof x!=='string'||(allowed?!allowed.includes(x):!x.trim()||x.length>60))||new Set(v).size!==v.length)throw new StudentLoginError(`Choose ${key}.`);return v.map(x=>x.trim());};
 const experience=Number(input.experience);
 if(!Number.isInteger(experience)||experience<0||experience>60)throw new StudentLoginError('Check years of experience.');
 return {name:text('name',100),bio:text('bio',1500),qualification:text('qualification',300),state:text('state',80),availability:text('availability',400),experience,subjects:list('subjects'),classes:list('classes',Array.from({length:12},(_,i)=>String(i+1))),boards:list('boards',['CBSE','ICSE','TBSE','Other']),languages:list('languages',['English','Hindi','Bengali','Other'])};
}
export function teacherReviewDecision(status,action,reason){
 if(!['approve','changes_requested','suspend'].includes(action))throw new StudentLoginError('Invalid review action.');
 if(action==='suspend'&&status!=='approved'||action!=='suspend'&&status!=='pending')throw new StudentLoginError('Application changed. Refresh before reviewing.',409);
 if(action!=='approve'&&(typeof reason!=='string'||!reason.trim()||reason.trim().length>500))throw new StudentLoginError('Enter a review reason (up to 500 characters).');
 return action==='approve'?'approved':action==='suspend'?'suspended':'changes_requested';
}
