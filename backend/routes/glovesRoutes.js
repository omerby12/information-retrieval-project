import express from 'express';
const router = express.Router();
import {
  getGlovesCutNegative,
  getGlovesBackhandLatexNeoprene,
  getGlovesWristClosureWraparound,
} from '../controllers/glovesController.js';

router.route('/negative-cut').get(getGlovesCutNegative);
router.route('/backhand-latex-neoprene').get(getGlovesBackhandLatexNeoprene);
router.route('/wrist-closure-wraparound').get(getGlovesWristClosureWraparound);
export default router;
