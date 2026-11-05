/* ===========================================================================
   Profile — a picture of yourself and three lines about you (01_Profile).

   The fields are locked until EDIT, and a line that has something in it fills
   solid, the way 01_Profile_02 shows it. Nothing leaves the page: the picture
   stays a canvas in this tab and the three lines stay in this object.
   =========================================================================== */

const Profile = (() => {
  const page   = document.querySelector('.page--profile');
  const av     = document.getElementById('avatar');
  const glyph  = av.querySelector('.avatar__glyph');
  const img    = av.querySelector('.avatar__img');
  const cam    = av.querySelector('.avatar__cam');
  const hint   = av.querySelector('[data-avatar-hint]');
  const pick   = document.getElementById('avatarPick');
  const file   = document.getElementById('avatarFile');
  const fields = [...page.querySelectorAll('.pfield')];
  const editBtn = document.getElementById('pEdit');
  const saveBtn = document.getElementById('pSave');

  glyph.innerHTML = ICONS.camera;

  let stream = null, editing = false;

  /* ── the fields ─────────────────────────────────────────────────────────
     Empty is an outline with the label sitting in it; filled is solid, with
     the label and what you typed both reading as cut-outs. */

  const inputOf = f => f.querySelector('.pfield__v');

  function dress(){
    fields.forEach(f => f.classList.toggle('is-on', !!inputOf(f).value.trim()));
  }

  fields.forEach(f => inputOf(f).addEventListener('input', dress));

  function setEditing(on){
    editing = on;
    page.classList.toggle('is-editing', on);
    fields.forEach(f => { inputOf(f).disabled = !on; });
    editBtn.classList.toggle('is-on', on);
    if (on) inputOf(fields[0]).focus();
  }

  editBtn.addEventListener('click', e => { e.stopPropagation(); setEditing(!editing); });
  saveBtn.addEventListener('click', e => {
    e.stopPropagation();
    setEditing(false);
    dress();
    saveBtn.classList.add('is-saved');
    setTimeout(() => saveBtn.classList.remove('is-saved'), 700);
  });

  /* ── the picture ────────────────────────────────────────────────────────
     Tapping the circle asks which way: the camera now, or a file already on
     the machine. With the camera armed the circle becomes the shutter. */

  const openPick = () => { pick.hidden = false; };
  const closePick = () => { pick.hidden = true; };

  function stopCam(){
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    cam.hidden = true; cam.srcObject = null;
    hint.hidden = true;
    av.classList.remove('is-live');
  }

  function useImage(src){
    img.src = src; img.hidden = false;
    glyph.hidden = true;
    av.classList.add('is-set');
  }

  av.addEventListener('click', e => {
    e.stopPropagation();
    if (stream) { shoot(); return; }     // armed — this click is the shutter
    pick.hidden ? openPick() : closePick();
  });

  pick.addEventListener('click', e => e.stopPropagation());

  pick.querySelectorAll('[data-pick]').forEach(b =>
    b.addEventListener('click', async () => {
      closePick();
      if (b.dataset.pick === 'file') { file.click(); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        cam.srcObject = stream; cam.hidden = false; await cam.play();
        glyph.hidden = true;
        hint.hidden = false;
        av.classList.add('is-live');
      } catch (err) {
        console.warn('[profile] camera unavailable:', err.name);
        hint.textContent = 'No Camera';
        hint.hidden = false;
        setTimeout(() => { hint.textContent = 'Take It'; hint.hidden = true; }, 1600);
      }
    }));

  function shoot(){
    const c = Object.assign(document.createElement('canvas'),
                            { width: cam.videoWidth, height: cam.videoHeight });
    /* mirrored on screen, so mirror it into the still as well — otherwise the
       picture comes out the other way round from the one you framed */
    const g = c.getContext('2d');
    g.translate(c.width, 0); g.scale(-1, 1);
    g.drawImage(cam, 0, 0);
    stopCam();
    useImage(c.toDataURL());
  }

  file.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    useImage(URL.createObjectURL(f));
    file.value = '';
  });

  document.addEventListener('click', () => { if (!pick.hidden) closePick(); });

  /* leaving the page must not leave the camera running */
  const close = () => { stopCam(); closePick(); setEditing(false); };

  dress();
  return { close };
})();
