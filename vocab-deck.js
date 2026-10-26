(function(root){
  'use strict';
  function shuffle(items,random){const next=[...items];for(let i=next.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[next[i],next[j]]=[next[j],next[i]];}return next;}
  class VocabDeck{
    constructor(ids=[],random=Math.random){this.random=random;this.ids=[];this.queue=[];this.seen=new Set();this.history=[];this.cursor=-1;this.setIds(ids);}
    reset(ids=this.ids){this.ids=[];this.queue=[];this.seen.clear();this.history=[];this.cursor=-1;this.setIds(ids);}
    snapshot(){return {version:1,ids:[...this.ids],queue:[...this.queue],seen:[...this.seen],history:[...this.history],cursor:this.cursor};}
    restore(state,ids=this.ids){
      const array=(value,max)=>Array.isArray(value)&&value.length<=max&&value.every(id=>typeof id==='string'&&id.length>0&&id.length<=500);
      const unique=value=>new Set(value).size===value.length;
      if(!array(ids,50000)||!unique(ids)){this.reset([]);return false;}
      if(!state||state.version!==1||!array(state.ids,50000)||!array(state.queue,50000)||!array(state.seen,50000)||!array(state.history,2048)||!unique(state.ids)||!unique(state.queue)||!unique(state.seen)||!Number.isInteger(state.cursor)||state.cursor< -1||state.cursor>=state.history.length){this.reset(ids);return false;}
      const saved=new Set(state.ids),seen=new Set(state.seen);
      if(state.queue.some(id=>!saved.has(id)||seen.has(id))||state.seen.some(id=>!saved.has(id))||state.history.some(id=>!saved.has(id))||state.queue.length+state.seen.length!==state.ids.length){this.reset(ids);return false;}
      this.ids=[...state.ids];this.queue=[...state.queue];this.seen=seen;this.history=[...state.history];this.cursor=state.cursor;this.setIds(ids);return true;
    }
    push(id){this.history.push(id);if(this.history.length>2048)this.history.shift();this.cursor=this.history.length-1;return id;}
    setIds(ids){
      const next=[...new Set(ids)],allowed=new Set(next),oldCurrent=this.current();
      const oldPosition=this.cursor;let newPosition=-1;
      this.history=this.history.filter((id,i)=>{const keep=allowed.has(id);if(keep&&i<=oldPosition)newPosition++;return keep;});
      this.cursor=Math.min(newPosition,this.history.length-1);this.ids=next;
      this.seen=new Set([...this.seen].filter(id=>allowed.has(id)));
      this.queue=this.queue.filter(id=>allowed.has(id)&&!this.seen.has(id));
      const waiting=new Set(this.queue),added=next.filter(id=>!this.seen.has(id)&&!waiting.has(id));
      if(added.length)this.queue=shuffle([...this.queue,...added],this.random);
      if(oldCurrent&&allowed.has(oldCurrent)&&this.history[this.cursor]!==oldCurrent)this.cursor=this.history.lastIndexOf(oldCurrent);
      return this.current();
    }
    current(){return this.history[this.cursor]||null;}
    canPrevious(){return this.cursor>0;}
    previous(){if(this.canPrevious())this.cursor--;return this.current();}
    visit(id){
      if(!this.ids.includes(id))return this.current();
      if(this.current()===id)return id;
      this.history=this.history.slice(0,this.cursor+1);this.push(id);
      this.seen.add(id);this.queue=this.queue.filter(x=>x!==id);return id;
    }
    next(){
      if(!this.ids.length)return null;
      if(this.cursor<this.history.length-1)return this.history[++this.cursor];
      if(!this.queue.length){
        this.seen.clear();this.queue=shuffle(this.ids,this.random);
        if(this.queue.length>1&&this.queue[0]===this.current()){
          const j=1+Math.floor(this.random()*(this.queue.length-1));[this.queue[0],this.queue[j]]=[this.queue[j],this.queue[0]];
        }
      }
      const id=this.queue.shift();this.seen.add(id);return this.push(id);
    }
  }
  root.IeltsVocabDeck=VocabDeck;
})(typeof window!=='undefined'?window:globalThis);
