// Empty imports and placeholders are omitted; explicit No and numeric zero remain meaningful.
export function hasDetail(value:unknown):boolean {
 if(value===undefined||value===null)return false;
 if(typeof value==='string')return !!value.trim()&&!/^(?:n\/?a|not recorded|not confirmed|unknown|unconfirmed|not assessed|not specified|not applicable|—|-)$/i.test(value.trim());
 return true;
}
export function phoneLink(value:unknown):string {
 const text=String(value??'').trim();if(!hasDetail(text))return '';
 const digits=text.replace(/[^\d+]/g,'');const count=digits.replace(/\D/g,'');return /^\+?\d{7,15}$/.test(digits)&&!/^0+$/.test(count)?'tel:'+digits:'';
}
